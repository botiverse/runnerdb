#!/usr/bin/env node
// runnerdb daily price check.
//
// For every provider with a fetcher below, download the provider's official pricing source,
// extract each runner's price and compare it with providers/<id>/runners/*.json:
//   - price changed   -> write the new price_usd_per_minute (and multiplier) + verified_as_of = today
//   - price unchanged -> bump verified_as_of to today
// and print a markdown summary.
//
// It fails (exit 1) when a fetcher can't find a runner that is in the repo, or finds no prices at all
// (usually a page redesign). Runners of a failed provider are left untouched, so no date is bumped
// without a successful check. SKUs found on a pricing page but missing from the repo are listed in
// the summary and never added automatically.
//
//   node scripts/fetch-prices.mjs                  check all providers and write changes
//   node scripts/fetch-prices.mjs --dry-run        check, but don't write files
//   node scripts/fetch-prices.mjs --provider depot,github
//   node scripts/fetch-prices.mjs --summary out.md also write the markdown summary to a file
//
// When GITHUB_OUTPUT is set (GitHub Actions), it also writes price_changes=<n>, reverified=<n>
// and failed=<n> there.
//
// No dependencies: Node >= 18 standard library only (global fetch).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROVIDERS_DIR = path.join(ROOT, 'providers');

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
};
const DRY_RUN = argv.includes('--dry-run');
const ONLY = arg('--provider')?.split(',').map((s) => s.trim()).filter(Boolean);
const SUMMARY_FILE = arg('--summary');
const TODAY = new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const UA = 'Mozilla/5.0 (compatible; runnerdb-price-check/1.0)';

// Several sites negotiate on Accept and serve markdown instead of HTML when it is listed, so ask
// for exactly the format each parser expects.
const ACCEPT = {
  html: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
  markdown: 'text/markdown,text/plain;q=0.9,*/*;q=0.8',
};

async function get(url, { as = 'html', tries = 3 } = {}) {
  let last;
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': UA, accept: ACCEPT[as] },
        redirect: 'follow',
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      last = e;
      if (i < tries) await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
  throw new Error(`could not fetch ${url}: ${last?.message ?? last}`);
}

const decode = (s) =>
  s
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d));

const text = (html) => decode(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

/** Strip scripts/styles, then return the visible text of an HTML page. */
const pageText = (html) => text(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' '));

/** HTML tables in document order, each with the nearest preceding <h1-h4> text: [{ heading, rows: [[cell, ...]] }]. */
function htmlTables(html) {
  html = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const out = [];
  const re = /<h([1-4])\b[^>]*>([\s\S]*?)<\/h\1>|<table\b[\s\S]*?<\/table>/gi;
  let heading = '';
  for (const m of html.matchAll(re)) {
    if (m[1]) { heading = text(m[2]); continue; }
    const rows = [...m[0].matchAll(/<tr\b[\s\S]*?<\/tr>/gi)].map((tr) =>
      [...tr[0].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => text(c[1])));
    out.push({ heading, rows: rows.filter((r) => r.length) });
  }
  return out;
}

/** Markdown pipe tables with the nearest preceding heading: [{ heading, rows: [[cell, ...]] }] (header row included, separator dropped). */
function mdTables(md) {
  const out = [];
  let heading = '';
  let cur = null;
  for (const raw of md.split('\n')) {
    const line = raw.trim();
    const h = /^#{1,6}\s+(.*)$/.exec(line);
    if (h) { heading = h[1].trim(); cur = null; continue; }
    if (line.startsWith('|')) {
      const cells = line.replace(/^\||\|$/g, '').split('|').map((c) => c.replace(/\\\$/g, '$').replace(/`/g, '').trim());
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
      if (!cur) { cur = { heading, rows: [] }; out.push(cur); }
      cur.rows.push(cells);
    } else {
      cur = null;
    }
  }
  return out;
}

/** "$0.004", "$0.004/min", "$ 0.1125 / min" -> 0.004; undefined if not a price. */
function usd(s) {
  const m = /^\$\s*([0-9]*\.?[0-9]+)\s*(?:\/\s*min(?:ute)?)?$/i.exec(String(s).trim());
  return m ? Number(m[1]) : undefined;
}

const sameNumber = (a, b) => Math.abs(a - b) < 1e-9;
const fmt = (n) => (n === undefined ? '—' : `$${n}`);

class FetchError extends Error {}
const need = (cond, msg) => { if (!cond) throw new FetchError(msg); };

// ---------------------------------------------------------------------------
// Fetchers
//
// A fetcher downloads the official source(s) and returns offerings: a Map from a provider-specific
// key to { price, name, multiplier? }. keyFor(runner) maps a runner file to one key or a list of
// candidate keys (e.g. its labels); every candidate that is found must agree on the price, and at
// least one must be found. Offerings that no runner claims are reported as new SKUs, unless they
// match the fetcher's optional `ignore` list (known, deliberate omissions).
//
// sourceUrls: the runner.source_url values this fetcher verifies. A runner citing a different
// source fails the check, so verified_as_of is never bumped against a page we didn't read.
// ---------------------------------------------------------------------------
const FETCHERS = {
  github: {
    sourceUrls: ['https://docs.github.com/en/billing/reference/actions-runner-pricing'],
    // The docs site serves the article as markdown through its article API.
    async fetch() {
      const md = await get('https://docs.github.com/api/article/body?pathname=/en/billing/reference/actions-runner-pricing', { as: 'markdown' });
      const offers = new Map();
      for (const t of mdTables(md)) {
        const [head, ...rows] = t.rows;
        const iSku = head.findIndex((c) => /billing sku/i.test(c));
        const iPrice = head.findIndex((c) => /per-minute rate/i.test(c));
        if (iSku === -1 || iPrice === -1) continue;
        for (const r of rows) {
          const price = usd(r[iPrice]);
          if (r[iSku] && price !== undefined) offers.set(r[iSku].replace(/\s+/g, ''), { price, name: `${r[0]} (${r[iSku].replace(/\s+/g, '')})` });
        }
      }
      return offers;
    },
    // runner id -> GitHub billing SKU (stable identifiers in the pricing reference)
    keyFor: (r) => ({
      'linux-2-core-x64': 'actions_linux',
      'linux-2-core-arm64': 'actions_linux_arm',
      'windows-2-core-x64': 'actions_windows',
      'macos-3-core-arm64': 'actions_macos',
      'macos-large-x64': 'macos_l',
      'macos-xlarge-arm64': 'macos_xl',
    })[r.id],
  },

  blacksmith: {
    sourceUrls: ['https://www.blacksmith.sh/pricing'],
    // The pricing page has a vCPU switcher whose options carry the prices as data attributes:
    // data-u64 (Ubuntu x64), data-arm (Ubuntu ARM), data-win (Windows), data-mac (macOS).
    async fetch() {
      const html = await get('https://www.blacksmith.sh/pricing');
      const offers = new Map();
      const re = /<div\b([^>]*\bdata-(?:u64|mac)=[^>]*)>[\s\S]{0,600}?featured-card-description-10">\s*(\d+)\s*</g;
      for (const m of html.matchAll(re)) {
        const vcpu = +m[2];
        const attr = (k) => { const a = new RegExp(`data-${k}="([^"]*)"`).exec(m[1]); return a ? usd(a[1]) : undefined; };
        for (const [k, key, name] of [['u64', `linux-x64-${vcpu}`, 'Ubuntu x64'], ['arm', `linux-arm64-${vcpu}`, 'Ubuntu ARM'], ['win', `windows-x64-${vcpu}`, 'Windows'], ['mac', `macos-arm64-${vcpu}`, 'macOS']]) {
          const price = attr(k);
          if (price !== undefined && !offers.has(key)) offers.set(key, { price, name: `${name} ${vcpu} vCPU` });
        }
      }
      return offers;
    },
    keyFor: (r) => `${r.os}-${r.arch}-${r.vcpu}`,
  },

  depot: {
    sourceUrls: ['https://depot.dev/docs/github-actions/runner-types'],
    // Runner-type tables: Label | CPUs | Memory | ... | Per-minute price | Minutes multiplier
    async fetch() {
      const html = await get('https://depot.dev/docs/github-actions/runner-types');
      const offers = new Map();
      for (const t of htmlTables(html)) {
        const [head, ...rows] = t.rows;
        const iPrice = head.findIndex((c) => /per-minute price/i.test(c));
        if (!/label/i.test(head[0] ?? '') || iPrice === -1) continue;
        for (const r of rows) {
          const price = usd(r[iPrice]);
          if (price === undefined) continue;
          for (const label of r[0].match(/depot-[a-z0-9.-]+/g) ?? []) offers.set(label, { price, name: label });
        }
      }
      return offers;
    },
    keyFor: (r) => r.labels,
  },

  namespace: {
    sourceUrls: ['https://namespace.so/pricing'],
    // Namespace publishes a machine-readable copy of its pricing page at /pricing.md.
    // Shape tables: vCPU | RAM | Multiplier | Prepaid | Overage. runnerdb uses the overage (pay-as-you-go) rate.
    async fetch() {
      const md = await get('https://namespace.so/pricing.md', { as: 'markdown' });
      const platforms = { Linux: 'linux', Windows: 'windows', 'macOS (Apple Silicon)': 'macos', 'Linux on Apple Silicon': 'linux-apple' };
      const offers = new Map();
      for (const t of mdTables(md)) {
        const platform = platforms[t.heading];
        if (!platform) continue;
        const [head, ...rows] = t.rows;
        const col = (re) => head.findIndex((c) => re.test(c));
        const [iV, iR, iM, iO] = [col(/^vcpu$/i), col(/^ram$/i), col(/^multiplier$/i), col(/^overage$/i)];
        if ([iV, iR, iM, iO].includes(-1)) continue;
        for (const r of rows) {
          const shape = `${parseInt(r[iV], 10)}x${parseInt(r[iR], 10)}`;
          const price = usd(r[iO]);
          if (price !== undefined) offers.set(`${platform}-${shape}`, { price, multiplier: Number(r[iM]), name: `${t.heading} ${shape}` });
        }
      }
      return offers;
    },
    // linux-x64-4x8 / linux-arm64-4x8 -> linux-4x8 (same price for amd64 and arm64), windows-x64-2x4 -> windows-2x4
    keyFor: (r) => `${r.os}-${r.id.split('-').at(-1)}`,
    // runnerdb lists only the standard GitHub Actions shapes (see providers/namespace/provider.json notes).
    ignore: [
      /^linux-(1x2|2x8|8x32|16x64|32x(128|256|512)|64x\d+)$/,
      /^windows-(1x2|2x8|4x16|8x32|16x64|32x(128|256|512))$/,
      /^macos-(4x7|6x28|8x14|16x\d+)$/,
      /^linux-apple-/,
    ],
  },

  ubicloud: {
    sourceUrls: ['https://www.ubicloud.com/docs/about/pricing'],
    // The docs site serves pages as markdown when ".md" is appended.
    async fetch() {
      const md = await get('https://www.ubicloud.com/docs/about/pricing.md', { as: 'markdown' });
      const sections = { 'Standard x64 Runners': 'standard-x64', 'Premium x64 Runners': 'premium-x64', 'arm64 Runners': 'standard-arm64' };
      const offers = new Map();
      for (const t of mdTables(md)) {
        const family = sections[t.heading];
        if (!family) continue;
        const [head, ...rows] = t.rows;
        const iPrice = head.findIndex((c) => /^ubicloud/i.test(c));
        if (iPrice === -1 || !/vcpu/i.test(head[0])) continue;
        for (const r of rows) {
          const price = usd(r[iPrice]);
          if (price !== undefined) offers.set(`${family}-${parseInt(r[0], 10)}`, { price, name: `${t.heading}, ${r[0]} vCPU` });
        }
      }
      return offers;
    },
    // standard-2-x64 -> standard-x64-2, premium-4-x64 -> premium-x64-4, standard-8-arm64 -> standard-arm64-8
    keyFor: (r) => { const [family, vcpu, arch] = r.id.split('-'); return `${family}-${arch}-${vcpu}`; },
  },

  warpbuild: {
    sourceUrls: ['https://www.warpbuild.com/pricing'],
    // Tables under "Cloud Runners - <platform>" headings: Size ("2vCPU, 8GB RAM") | Price / min
    async fetch() {
      const html = await get('https://www.warpbuild.com/pricing');
      const sections = {
        'Cloud Runners - Linux (x86-64)': 'ubuntu-x64',
        'Cloud Runners - Linux (arm64)': 'ubuntu-arm64',
        'Cloud Runners - Linux (arm64 on Apple Silicon)': 'ubuntu-arm64-xfast',
        'Cloud Runners - Windows (x86-64)': 'windows-x64',
        'Cloud Runners - MacOS (M4/M5 Pro)': 'macos-arm64',
      };
      const offers = new Map();
      for (const t of htmlTables(html)) {
        const family = sections[t.heading];
        if (!family) continue;
        for (const r of t.rows) {
          const v = /^(\d+)\s*vCPU/i.exec(r[0] ?? '');
          const price = usd(r[1] ?? '');
          if (v && price !== undefined) offers.set(`${family}-${v[1]}x`, { price, name: `${t.heading.replace('Cloud Runners - ', '')} ${r[0]}` });
        }
      }
      return offers;
    },
    // ubuntu-x64-2x -> ubuntu-x64-2x; ubuntu-arm64-6x-xfast -> ubuntu-arm64-xfast-6x
    keyFor: (r) => r.id.replace(/^(.*)-(\d+x)-xfast$/, '$1-xfast-$2'),
  },

  'runs-on': {
    sourceUrls: ['https://runs-on.com/docs/runners/platforms/linux/'],
    // RunsOn has no per-minute price (flat annual license + your own AWS bill), stored as billing.unit "flat".
    // Check that the pricing model is unchanged and that each predefined runner still exists.
    async fetch() {
      const pricing = pageText(await get('https://runs-on.com/pricing/'));
      need(/flat (annual )?license/i.test(pricing) && /no minute-metering|no markup/i.test(pricing),
        'runs-on.com/pricing no longer describes a flat license with no minute-metering/markup; the $0 per-minute model needs a manual review');
      const offers = new Map();
      for (const t of htmlTables(await get('https://runs-on.com/docs/runners/platforms/linux/'))) {
        if (!/^runner$/i.test(t.rows[0]?.[0] ?? '')) continue;
        for (const r of t.rows.slice(1)) if (/^\d+cpu-linux-(x64|arm64)$/.test(r[0])) offers.set(r[0], { price: 0, name: `${r[0]} (Flex predefined runner)` });
      }
      return offers;
    },
    keyFor: (r) => r.id,
  },

  'cirrus-runners': {
    sourceUrls: ['https://cirrus-runners.app/pricing/'],
    // Flat $150/month per concurrency unit, unlimited minutes; stored as billing.unit "flat" with each runner's fee in flat_fee.
    // Check the fee and the unlimited-minutes wording on the pricing page, and that each runner's resource
    // class is still in the setup page's tables (Resource Class | Suffix | CPUs | Memory | [GPU] | Disk |
    // Concurrency), which come in the order macOS, Linux x86, Linux Arm, Linux GPU.
    async fetch() {
      const pricing = pageText(await get('https://cirrus-runners.app/pricing/'));
      const fee = /costs \$(\d+(?:\.\d+)?) a month/i.exec(pricing);
      need(fee, 'cirrus-runners.app/pricing: monthly fee per Cirrus Runner not found (page redesign?)');
      need(+fee[1] === 150, `cirrus-runners.app/pricing: fee changed from $150 to $${fee[1]} per runner per month; update flat_fee in providers/cirrus-runners by hand`);
      need(/no limit on the amount of minutes/i.test(pricing), 'cirrus-runners.app/pricing no longer says minutes are unlimited; the $0 per-minute model needs a manual review');
      const tables = htmlTables(await get('https://cirrus-runners.app/setup/'))
        .filter((t) => t.rows[0]?.some((c) => /^suffix$/i.test(c)) && t.rows[0].some((c) => /^concurrency$/i.test(c)));
      need(tables.length === 4 && tables[3].rows[0].some((c) => /^gpu$/i.test(c)),
        `cirrus-runners.app/setup: expected 4 resource-class tables (macOS, Linux x86, Linux Arm, Linux GPU), found ${tables.length}`);
      const offers = new Map();
      ['macos-arm64', 'linux-x64', 'linux-arm64', 'linux-x64-gpu'].forEach((platform, i) => {
        const [head, ...rows] = tables[i].rows;
        const iS = head.findIndex((c) => /^suffix$/i.test(c));
        for (const r of rows) {
          const suffix = /^[a-z]+/.exec(r[iS] ?? '')?.[0];
          if (suffix) offers.set(`${platform}-${suffix}`, { price: 0, name: `${platform} ${r[0]} (${suffix}): ${r[2]} CPUs, ${r[3]}` });
        }
      });
      return offers;
    },
    keyFor: (r) => r.id, // runner ids are <platform>-<suffix>, e.g. linux-x64-md, linux-x64-gpu-xl
  },
};

// Providers deliberately without a fetcher.
const NO_FETCHER = {};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const readJSON = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const writeJSON = (f, v) => fs.writeFileSync(f, JSON.stringify(v, null, 2) + '\n');

const providerIds = fs.readdirSync(PROVIDERS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
const errors = [];
const changes = []; // { provider, runner, old, next, source }
const reverified = []; // { provider, runner }
const newSkus = []; // { provider, name, price, source }
const skipped = [];
const ignoredCount = {}; // provider -> SKUs matched by fetcher.ignore (known, deliberate omissions)

for (const id of ONLY ?? providerIds) {
  if (!providerIds.includes(id)) { errors.push(`${id}: no such provider directory`); continue; }
  const fetcher = FETCHERS[id];
  if (!fetcher) {
    if (NO_FETCHER[id]) skipped.push(`${id}: ${NO_FETCHER[id]}`);
    else errors.push(`${id}: no fetcher in scripts/fetch-prices.mjs (add one, or list the provider in NO_FETCHER with a reason)`);
    continue;
  }

  const pDir = path.join(PROVIDERS_DIR, id);
  const provider = readJSON(path.join(pDir, 'provider.json'));
  const base = provider.billing?.base_rate_usd;
  const rDir = path.join(pDir, 'runners');
  const runners = fs.readdirSync(rDir).filter((f) => f.endsWith('.json')).sort().map((f) => ({ file: path.join(rDir, f), data: readJSON(path.join(rDir, f)) }));

  let offers;
  try {
    offers = await fetcher.fetch();
    need(offers.size > 0, 'no prices found on the source page (page redesign?)');
  } catch (e) {
    errors.push(`${id}: ${e.message}`);
    continue;
  }

  // Resolve every runner first; only write if the whole provider checks out.
  const pending = [];
  const claimed = new Set();
  const provErrors = [];
  for (const { file, data: r } of runners) {
    if (!fetcher.sourceUrls.includes(r.source_url)) {
      provErrors.push(`${id}/${r.id}: source_url ${r.source_url} is not a source this fetcher reads (${fetcher.sourceUrls.join(', ')})`);
      continue;
    }
    const keys = [fetcher.keyFor(r)].flat().filter(Boolean);
    const hits = keys.filter((k) => offers.has(k));
    hits.forEach((k) => claimed.add(k));
    if (hits.length === 0) {
      provErrors.push(`${id}/${r.id}: not found on ${r.source_url} (looked for ${keys.map((k) => `"${k}"`).join(', ') || 'no key'})`);
      continue;
    }
    const prices = [...new Set(hits.map((k) => offers.get(k).price))];
    if (prices.length > 1) {
      provErrors.push(`${id}/${r.id}: labels disagree on price (${hits.map((k) => `${k}=${fmt(offers.get(k).price)}`).join(', ')}); split the runner or fix the fetcher`);
      continue;
    }
    const price = prices[0];
    const next = { ...r, verified_as_of: TODAY };
    if (!sameNumber(price, r.price_usd_per_minute)) {
      next.price_usd_per_minute = price;
      if (base !== undefined) {
        const mult = +(price / base).toFixed(6);
        const pageMult = offers.get(hits[0]).multiplier;
        if (pageMult !== undefined && !sameNumber(pageMult, mult)) {
          provErrors.push(`${id}/${r.id}: new price ${fmt(price)} with multiplier ${pageMult} implies base rate ${+(price / pageMult).toFixed(9)}, not billing.base_rate_usd ${base}; update provider.json by hand`);
          continue;
        }
        next.multiplier = mult;
      }
      pending.push({ file, next, change: { provider: id, runner: r.id, old: r.price_usd_per_minute, next: price, source: r.source_url } });
    } else {
      pending.push({ file, next, reverify: { provider: id, runner: r.id } });
    }
  }

  if (provErrors.length) {
    errors.push(...provErrors);
    continue; // leave every runner of this provider untouched
  }

  for (const p of pending) {
    if (!DRY_RUN) writeJSON(p.file, p.next);
    if (p.change) changes.push(p.change);
    else reverified.push(p.reverify);
  }
  for (const [key, o] of offers) {
    if (claimed.has(key)) continue;
    if ((fetcher.ignore ?? []).some((re) => re.test(key))) { ignoredCount[id] = (ignoredCount[id] ?? 0) + 1; continue; }
    newSkus.push({ provider: id, name: o.name, price: o.price, source: fetcher.sourceUrls[0] });
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
const lines = [];
lines.push(`## runnerdb price check, ${TODAY}`, '');
if (changes.length) {
  lines.push(`### Price changes (${changes.length})`, '', '| Provider | Runner | Old | New | Source |', '| --- | --- | --- | --- | --- |');
  for (const c of changes) lines.push(`| ${c.provider} | ${c.runner} | ${fmt(c.old)}/min | ${fmt(c.next)}/min | ${c.source} |`);
  lines.push('');
} else {
  lines.push('No price changes.', '');
}
const byProvider = {};
for (const r of reverified) byProvider[r.provider] = (byProvider[r.provider] ?? 0) + 1;
if (reverified.length) {
  lines.push(`### Re-verified unchanged (${reverified.length})`, '');
  for (const [p, n] of Object.entries(byProvider)) lines.push(`- ${p}: ${n} runner(s), verified_as_of set to ${TODAY}`);
  lines.push('');
}
if (newSkus.length) {
  lines.push(`### On the pricing pages but not in runnerdb (${newSkus.length})`, '', 'Not added automatically; add them by hand if they are GitHub Actions runners.', '', '| Provider | SKU | Price | Source |', '| --- | --- | --- | --- |');
  for (const s of newSkus) lines.push(`| ${s.provider} | ${s.name} | ${fmt(s.price)}/min | ${s.source} |`);
  lines.push('');
}
if (Object.keys(ignoredCount).length) {
  lines.push(`Known omissions skipped: ${Object.entries(ignoredCount).map(([p, n]) => `${p} ${n}`).join(', ')} (see each fetcher's \`ignore\` list).`, '');
}
if (skipped.length) {
  lines.push('### Not checked', '');
  for (const s of skipped) lines.push(`- ${s}`);
  lines.push('');
}
if (errors.length) {
  lines.push(`### Errors (${errors.length})`, '', 'These providers were left unchanged. A missing runner usually means the pricing page changed; fix the fetcher in scripts/fetch-prices.mjs or update the data by hand.', '');
  for (const e of errors) lines.push(`- ${e}`);
  lines.push('');
}
if (DRY_RUN) lines.push('_Dry run: no files were written._', '');

const summary = lines.join('\n');
console.log(summary);
if (SUMMARY_FILE) fs.writeFileSync(SUMMARY_FILE, summary + '\n');
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `price_changes=${changes.length}\nreverified=${reverified.length}\nfailed=${errors.length}\n`);
}
if (errors.length) {
  console.error(`\nprice check FAILED: ${errors.length} error(s), see "Errors" above`);
  process.exit(1);
}
