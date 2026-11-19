#!/usr/bin/env node
// runnerdb build: validates providers/**.json against schema/*.json and writes dist/.
//
//   node build.mjs           validate, then write dist/api.json, dist/schema.json, dist/index.html
//   node build.mjs --check   validate only; exit 1 on any error
//
// No dependencies: Node >= 18 standard library only.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PROVIDERS_DIR = path.join(ROOT, 'providers');
const DIST = path.join(ROOT, 'dist');
const SITE = 'https://runnerdb.stamp.build';
const CHECK_ONLY = process.argv.includes('--check');

const errors = [];
const rel = (p) => path.relative(ROOT, p);
const fail = (file, msg) => errors.push(`${rel(file)}: ${msg}`);

function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    fail(file, `invalid JSON: ${e.message}`);
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Tiny JSON Schema (draft 2020-12 subset) validator.
// Supports: type (string or array), enum, const, required, properties,
// additionalProperties (bool or schema), items, minItems, uniqueItems,
// minLength, pattern, minimum, maximum, exclusiveMinimum, format (date, uri).
// Anything else in a schema is an error, so the subset can't silently drift.
// ---------------------------------------------------------------------------
const KNOWN_KEYWORDS = new Set([
  '$schema', '$id', 'title', 'description', 'type', 'enum', 'const', 'required',
  'properties', 'additionalProperties', 'items', 'minItems', 'uniqueItems',
  'minLength', 'pattern', 'minimum', 'maximum', 'exclusiveMinimum', 'format',
]);

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  return typeof v;
}

function isValidDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function validate(schema, value, at, out) {
  for (const k of Object.keys(schema)) {
    if (!KNOWN_KEYWORDS.has(k)) throw new Error(`schema uses unsupported keyword "${k}" at ${at || '/'}`);
  }
  const where = at || '(root)';
  const t = typeOf(value);

  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const ok = types.some((ty) => ty === t || (ty === 'number' && t === 'integer'));
    if (!ok) {
      out.push(`${where}: expected ${types.join(' or ')}, got ${t}`);
      return;
    }
  }
  if (schema.enum && !schema.enum.some((e) => e === value)) {
    out.push(`${where}: must be one of ${schema.enum.map((e) => JSON.stringify(e)).join(', ')}; got ${JSON.stringify(value)}`);
  }
  if ('const' in schema && schema.const !== value) {
    out.push(`${where}: must equal ${JSON.stringify(schema.const)}`);
  }

  if (t === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) out.push(`${where}: must not be empty`);
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) out.push(`${where}: "${value}" does not match /${schema.pattern}/`);
    if (schema.format === 'date' && !isValidDate(value)) out.push(`${where}: "${value}" is not a valid YYYY-MM-DD date`);
    if (schema.format === 'uri') {
      let u;
      try { u = new URL(value); } catch { /* handled below */ }
      if (!u || u.protocol !== 'https:') out.push(`${where}: "${value}" must be an absolute https:// URL`);
    }
  }

  if (t === 'number' || t === 'integer') {
    if (!Number.isFinite(value)) out.push(`${where}: must be finite`);
    if (schema.minimum !== undefined && value < schema.minimum) out.push(`${where}: must be >= ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) out.push(`${where}: must be <= ${schema.maximum}`);
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) out.push(`${where}: must be > ${schema.exclusiveMinimum}`);
  }

  if (t === 'array') {
    if (schema.minItems !== undefined && value.length < schema.minItems) out.push(`${where}: needs at least ${schema.minItems} item(s)`);
    if (schema.uniqueItems) {
      const seen = new Set();
      for (const item of value) {
        const key = JSON.stringify(item);
        if (seen.has(key)) out.push(`${where}: duplicate item ${key}`);
        seen.add(key);
      }
    }
    if (schema.items) value.forEach((item, i) => validate(schema.items, item, `${at}/${i}`, out));
  }

  if (t === 'object') {
    for (const req of schema.required || []) {
      if (!(req in value)) out.push(`${where}: missing required field "${req}"`);
    }
    const props = schema.properties || {};
    for (const [k, v] of Object.entries(value)) {
      if (k in props) validate(props[k], v, `${at}/${k}`, out);
      else if (schema.additionalProperties === false) out.push(`${where}: unknown field "${k}"`);
      else if (typeof schema.additionalProperties === 'object') validate(schema.additionalProperties, v, `${at}/${k}`, out);
    }
  }
}

function check(schema, value, file) {
  const out = [];
  validate(schema, value, '', out);
  for (const m of out) fail(file, m);
  return out.length === 0;
}

// ---------------------------------------------------------------------------
// Load + validate
// ---------------------------------------------------------------------------
const providerSchema = readJSON(path.join(ROOT, 'schema/provider.schema.json'));
const runnerSchema = readJSON(path.join(ROOT, 'schema/runner.schema.json'));
if (!providerSchema || !runnerSchema) bail();

const today = new Date().toISOString().slice(0, 10);
const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const providers = {};
const labelOwners = new Map(); // label/pattern -> "provider/runner"

const listDir = (d) => fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));

for (const pEnt of listDir(PROVIDERS_DIR)) {
  const pDir = path.join(PROVIDERS_DIR, pEnt.name);
  if (!pEnt.isDirectory()) { fail(pDir, 'unexpected file; only provider directories belong in providers/'); continue; }
  const pid = pEnt.name;
  if (!ID_RE.test(pid)) fail(pDir, `provider directory name must match ${ID_RE}`);

  const pFile = path.join(pDir, 'provider.json');
  if (!fs.existsSync(pFile)) { fail(pDir, 'missing provider.json'); continue; }
  const provider = readJSON(pFile);
  if (provider === undefined || !check(providerSchema, provider, pFile)) continue;
  delete provider.$schema;

  const base = provider.billing.base_rate_usd;
  const runners = {};
  const rDir = path.join(pDir, 'runners');
  if (!fs.existsSync(rDir)) fail(pDir, 'missing runners/ directory');

  for (const rEnt of fs.existsSync(rDir) ? listDir(rDir) : []) {
    const rFile = path.join(rDir, rEnt.name);
    if (!rEnt.isFile() || !rEnt.name.endsWith('.json')) { fail(rFile, 'only <runner-id>.json files belong in runners/'); continue; }
    const runner = readJSON(rFile);
    if (runner === undefined || !check(runnerSchema, runner, rFile)) continue;
    delete runner.$schema;

    // Cross-field rules the schema can't express.
    if (`${runner.id}.json` !== rEnt.name) fail(rFile, `id "${runner.id}" must match file name (expected ${runner.id}.json)`);
    if (runner.verified_as_of > today) fail(rFile, `verified_as_of ${runner.verified_as_of} is in the future`);
    if (base !== undefined) {
      if (runner.multiplier === undefined) {
        fail(rFile, `provider uses multiplier billing (base_rate_usd=${base}); "multiplier" is required`);
      } else {
        const expected = base * runner.multiplier;
        if (Math.abs(expected - runner.price_usd_per_minute) > 1e-9) {
          fail(rFile, `price_usd_per_minute ${runner.price_usd_per_minute} != base_rate_usd ${base} x multiplier ${runner.multiplier} = ${+expected.toFixed(9)}`);
        }
      }
    } else if (runner.multiplier !== undefined) {
      fail(rFile, '"multiplier" set but provider has no billing.base_rate_usd');
    }
    if (provider.billing.unit === 'none' && runner.price_usd_per_minute !== 0) {
      fail(rFile, 'provider billing.unit is "none" but price_usd_per_minute is not 0');
    }
    if (provider.public_repo_policy === 'billed' && runner.public_repo_free) {
      fail(rFile, 'provider public_repo_policy is "billed" but runner says public_repo_free: true');
    }
    for (const label of runner.labels) {
      if (/\s/.test(label)) fail(rFile, `label "${label}" contains whitespace`);
      const owner = labelOwners.get(label);
      if (owner) fail(rFile, `label "${label}" already claimed by ${owner}`);
      else labelOwners.set(label, `${pid}/${runner.id}`);
    }

    runners[runner.id] = { ...runner, provider: pid, as_of: runner.verified_as_of };
  }
  if (Object.keys(runners).length === 0) fail(pDir, 'provider has no runners');

  const asOf = Object.values(runners).map((r) => r.as_of).sort().at(-1) ?? null;
  providers[pid] = { id: pid, ...provider, as_of: asOf, runners };
}

function bail() {
  console.error(`\n${errors.length} error(s):\n`);
  for (const e of errors) console.error(`  x ${e}`);
  console.error('');
  process.exit(1);
}

// A wildcard label ("*" = one or more chars) must not shadow another runner's exact label.
for (const [pattern, owner] of labelOwners) {
  if (!pattern.includes('*')) continue;
  const re = new RegExp('^' + pattern.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.+') + '$');
  for (const [label, other] of labelOwners) {
    if (other !== owner && !label.includes('*') && re.test(label)) {
      errors.push(`providers/${owner}: label pattern "${pattern}" also matches "${label}" of ${other}`);
    }
  }
}

if (errors.length) bail();

const allRunners = Object.values(providers).flatMap((p) => Object.values(p.runners));
console.log(`ok: ${Object.keys(providers).length} providers, ${allRunners.length} runners, ${labelOwners.size} labels`);
if (CHECK_ONLY) process.exit(0);

// ---------------------------------------------------------------------------
// Emit dist/
// ---------------------------------------------------------------------------
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

const api = {
  $schema: `${SITE}/schema.json`,
  as_of: allRunners.map((r) => r.as_of).sort().at(-1),
  providers,
};
fs.writeFileSync(path.join(DIST, 'api.json'), JSON.stringify(api, null, 2) + '\n');

const strip = ({ $schema, $id, ...rest }) => rest;
const combined = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: `${SITE}/schema.json`,
  title: 'runnerdb source schemas',
  description: 'Schemas for providers/<id>/provider.json and providers/<id>/runners/<runner-id>.json. dist/api.json adds id, provider, as_of and a runners map to these shapes.',
  $defs: { provider: strip(providerSchema), runner: strip(runnerSchema) },
};
fs.writeFileSync(path.join(DIST, 'schema.json'), JSON.stringify(combined, null, 2) + '\n');

fs.writeFileSync(path.join(DIST, 'index.html'), renderHTML(api));
console.log(`wrote ${['api.json', 'schema.json', 'index.html'].map((f) => rel(path.join(DIST, f))).join(', ')}`);

function renderHTML(api) {
  const REPO = 'https://github.com/botiverse/runnerdb';
  // All data is rendered server-side into HTML, so everything goes through esc().
  // No dataset values are placed inside <script>, so they can never close it.
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const attr = (v) => (v === null || v === undefined ? '' : esc(v));
  const usd = (x) => '$' + +x.toFixed(4);
  const usdH = (x) => { const h = x * 60; return '$' + (h === 0 ? '0' : h < 0.1 ? String(+h.toFixed(3)) : h.toFixed(2)); };
  const OS = { linux: 'Linux', windows: 'Windows', macos: 'macOS' };
  const shortName = (p) => p.name.replace(/\s+runners$/i, '');

  const providers = Object.values(api.providers);
  const pIndex = new Map(providers.map((p, i) => [p.id, i]));
  const items = providers.flatMap((p) => Object.values(p.runners).map((r) => ({ p, r })));
  items.sort((a, b) => a.r.price_usd_per_minute - b.r.price_usd_per_minute
    || shortName(a.p).localeCompare(shortName(b.p)) || a.r.id.localeCompare(b.r.id));
  const labelCount = items.reduce((n, { r }) => n + r.labels.length, 0);
  const osList = Object.keys(OS).filter((os) => items.some(({ r }) => r.os === os));
  const has = (f) => items.some(({ r }) => f(r) !== null && f(r) !== undefined);
  const col = {
    mem: has((r) => r.memory_gb),
    mult: has((r) => r.multiplier),
    flex: has((r) => r.scheduling_discounts?.flex),
  };

  const icon = {
    check: '<svg class="i" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    ext: '<svg class="i" viewBox="0 0 16 16" aria-hidden="true"><path d="M9 3h4v4M13 3L7.5 8.5M11 9.5V13H3V5h3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    gh: '<svg class="i" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>',
    search: '<svg class="i" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  };
  const logoSVG = (fill) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="${fill}"/><path d="M9 11h14M9 16h14M9 21h8" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>`;
  const favicon = 'data:image/svg+xml,' + encodeURIComponent(logoSVG('#4338ca'));

  const rowsHTML = items.map(({ p, r }) => {
    const flex = r.scheduling_discounts?.flex ?? null;
    const q = [p.name, p.id, r.id, ...r.labels, r.os, OS[r.os], r.os_version, r.arch].filter(Boolean).join(' ').toLowerCase();
    let host = '';
    try { host = new URL(r.source_url).hostname; } catch { /* validated as https URL already */ }
    const cells = [
      `<th scope="row" class="c-runner"><span class="prov" data-p="${pIndex.get(p.id) % 6}"><i aria-hidden="true"></i>${esc(shortName(p))}</span><span class="rid">${esc(r.id)}</span></th>`,
      `<td class="c-labels"><div class="labels">${r.labels.map((l) => `<button type="button" class="lbl" data-copy="${esc(l)}" title="Copy ${esc(l)}">${esc(l)}</button>`).join('')}</div></td>`,
      `<td><span class="tag os-${esc(r.os)}">${esc(OS[r.os] ?? r.os)}</span></td>`,
      `<td><span class="tag mono">${esc(r.arch)}</span></td>`,
      `<td class="num">${r.vcpu === null ? '<span class="na" title="Not verified">&ndash;</span>' : esc(r.vcpu)}</td>`,
      col.mem ? `<td class="num">${r.memory_gb == null ? '<span class="na">&ndash;</span>' : esc(r.memory_gb) + '<small> GB</small>'}</td>` : '',
      `<td class="num c-price"><span class="price"><span class="pm">${esc(usd(r.price_usd_per_minute))}<small>/min</small></span><span class="ph">${esc(usdH(r.price_usd_per_minute))}<small>/h</small></span></span></td>`,
      col.mult ? `<td class="num">${r.multiplier == null ? '<span class="na">&ndash;</span>' : esc(r.multiplier) + '&times;'}</td>` : '',
      col.flex ? `<td class="num">${flex === null ? '<span class="na">&ndash;</span>' : `<span title="Flex scheduling: ${esc(Math.round(flex * 100))}% of list price (${esc(usd(r.price_usd_per_minute * flex))}/min)">${esc(flex)}&times;</span>`}</td>` : '',
      `<td class="c-free">${r.public_repo_free ? `<span class="yes">${icon.check}<span class="sr">Yes</span></span>` : '<span class="na">&ndash;<span class="sr">No</span></span>'}</td>`,
      `<td class="c-date">${esc(r.as_of)}</td>`,
      `<td class="c-src"><a href="${esc(r.source_url)}" target="_blank" rel="noopener" title="${esc(host)}" aria-label="Source for ${esc(r.id)} (${esc(host)})">${icon.ext}</a></td>`,
    ].join('');
    const data = {
      provider: p.id, os: r.os, q,
      'k-runner': `${shortName(p)} ${r.id}`.toLowerCase(), 'k-labels': r.labels[0], 'k-os': r.os, 'k-arch': r.arch,
      'k-vcpu': r.vcpu, 'k-mem': r.memory_gb, 'k-price': r.price_usd_per_minute, 'k-mult': r.multiplier,
      'k-flex': flex, 'k-free': r.public_repo_free ? 1 : 0, 'k-asof': r.as_of,
    };
    return `<tr ${Object.entries(data).map(([k, v]) => `data-${k}="${attr(v)}"`).join(' ')}>${cells}</tr>`;
  }).join('\n');

  const th = (k, label, cls = '', title = '') =>
    `<th scope="col" data-k="${k}"${cls ? ` class="${cls}"` : ''}${k === 'price' ? ' aria-sort="ascending"' : ''}><button type="button"${title ? ` title="${esc(title)}"` : ''}>${label}<span class="arrow" aria-hidden="true"></span></button></th>`;
  const head = [
    th('runner', 'Runner', 'c-runner'),
    th('labels', '<code>runs-on</code> labels'),
    th('os', 'OS'),
    th('arch', 'Arch'),
    th('vcpu', 'vCPU', 'num'),
    col.mem ? th('mem', 'RAM', 'num') : '',
    th('price', 'Price', 'num c-price', 'List price per runtime minute'),
    col.mult ? th('mult', 'Mult.', 'num', 'Billing-minute multiplier') : '',
    col.flex ? th('flex', 'Flex', 'num', 'Price factor for flex scheduling') : '',
    th('free', 'Public repos', '', 'Free for jobs from public repositories'),
    th('asof', 'Verified'),
    '<th scope="col" class="c-src"><span class="sr">Source</span></th>',
  ].join('');
  const nCols = 9 + col.mem + col.mult + col.flex;

  const chip = (group, value, label) => `<button type="button" class="fchip" data-group="${group}" data-value="${esc(value)}" aria-pressed="false">${label}</button>`;
  const desc = `Open dataset of CI runner prices, specs and billing rules: what a runs-on label costs per minute across ${providers.length} providers and ${items.length} runner types. Data as of ${api.as_of}.`;

  return `<!doctype html>
<html lang="en" class="no-js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>runnerdb: CI runner prices, specs and billing rules</title>
<meta name="description" content="${esc(desc)}">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#09090b" media="(prefers-color-scheme: dark)">
<link rel="icon" href="${favicon}">
<link rel="canonical" href="${SITE}/">
<meta property="og:type" content="website">
<meta property="og:site_name" content="runnerdb">
<meta property="og:title" content="runnerdb: CI runner prices, specs and billing rules">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${SITE}/">
<meta name="twitter:card" content="summary">
<script>document.documentElement.classList.remove('no-js')</script>
<style>
  :root {
    color-scheme: light dark;
    --bg: #ffffff; --surface: #ffffff; --zebra: #fafafa; --hover: #f1f2f6; --head: #f7f7f8;
    --border: #e4e4e7; --border-strong: #d4d4d8;
    --text: #18181b; --muted: #52525b; --faint: #6b6b74;
    --accent: #4338ca; --accent-fg: #ffffff; --accent-soft: #eef0ff; --accent-text: #3730a3;
    --chip: #f4f4f5; --chip-border: #e4e4e7;
    --shadow: 0 1px 2px rgb(0 0 0 / .04), 0 1px 3px rgb(0 0 0 / .05);
    --sans: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
    --p0: #6366f1; --p1: #0ea5e9; --p2: #a1a1aa; --p3: #10b981; --p4: #f59e0b; --p5: #ec4899;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #09090b; --surface: #0e0e11; --zebra: #121215; --hover: #1b1b21; --head: #141418;
      --border: #26262b; --border-strong: #3a3a42;
      --text: #f4f4f5; --muted: #b4b4bc; --faint: #8e8e98;
      --accent: #8b93ff; --accent-fg: #0b0b1a; --accent-soft: #1d1b45; --accent-text: #c7cbff;
      --chip: #18181c; --chip-border: #2c2c33;
      --shadow: 0 1px 2px rgb(0 0 0 / .4);
    }
  }
  *, *::before, *::after { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.5 var(--sans); -webkit-font-smoothing: antialiased; }
  a { color: var(--accent-text); text-decoration: none; }
  a:hover { text-decoration: underline; }
  code, .mono { font-family: var(--mono); }
  :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 4px; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .i { width: 1em; height: 1em; flex: none; vertical-align: -0.125em; }
  .wrap { max-width: 1320px; margin: 0 auto; padding: 0 24px; }

  /* Header */
  header.site { border-bottom: 1px solid var(--border); }
  .top { display: flex; align-items: center; gap: 12px 24px; flex-wrap: wrap; justify-content: space-between; padding-top: 18px; padding-bottom: 18px; }
  .brand { display: flex; align-items: center; gap: 10px; color: var(--text); }
  .brand:hover { text-decoration: none; }
  .brand svg { width: 26px; height: 26px; display: block; }
  .brand b { font: 700 18px/1 var(--mono); letter-spacing: -0.02em; }
  nav.links { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  nav.links a { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 7px; color: var(--muted); font-size: 13px; font-weight: 500; }
  nav.links a:hover { background: var(--chip); color: var(--text); text-decoration: none; }
  nav.links { margin-left: auto; }
  a.cta { display: inline-flex; align-items: center; padding: 6px 12px; border-radius: 7px; background: var(--accent); color: var(--accent-fg); font-size: 13px; font-weight: 600; }
  a.cta:hover { filter: brightness(1.08); text-decoration: none; }
  .hero { padding-top: 28px; padding-bottom: 24px; }
  .hero h1 { margin: 0 0 6px; font-size: clamp(22px, 3vw, 28px); line-height: 1.2; letter-spacing: -0.02em; font-weight: 650; }
  .hero p { margin: 0; color: var(--muted); max-width: 72ch; }
  .stats { display: flex; flex-wrap: wrap; gap: 8px; margin: 18px 0 0; padding: 0; list-style: none; }
  .stats li { display: inline-flex; align-items: baseline; gap: 6px; padding: 5px 11px; border: 1px solid var(--border); border-radius: 999px; background: var(--surface); color: var(--muted); font-size: 13px; }
  .stats b { color: var(--text); font-weight: 650; font-variant-numeric: tabular-nums; }
  .stats .mono { font-size: 12.5px; }

  /* Toolbar */
  main { padding-top: 20px; padding-bottom: 32px; }
  .toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; margin-bottom: 12px; }
  .search { position: relative; flex: 1 1 260px; max-width: 360px; }
  .search .i { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--faint); }
  .search input { width: 100%; height: 34px; padding: 0 10px 0 32px; border: 1px solid var(--border-strong); border-radius: 8px; background: var(--surface); color: var(--text); font: inherit; }
  .search input::placeholder { color: var(--faint); }
  .search input:focus { outline: 2px solid var(--accent); outline-offset: -1px; border-color: transparent; }
  .chips { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .chips .lab { color: var(--faint); font-size: 12px; text-transform: uppercase; letter-spacing: .06em; margin-right: 2px; }
  .fchip { height: 28px; padding: 0 10px; border: 1px solid var(--chip-border); border-radius: 999px; background: var(--surface); color: var(--muted); font: 500 13px/1 var(--sans); cursor: pointer; }
  .fchip:hover { border-color: var(--border-strong); color: var(--text); }
  .fchip[aria-pressed="true"] { background: var(--accent-soft); border-color: var(--accent); color: var(--accent-text); }
  .spacer { flex: 1 1 auto; }
  .count { color: var(--faint); font-size: 13px; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .seg { display: inline-flex; border: 1px solid var(--border-strong); border-radius: 8px; padding: 2px; background: var(--surface); }
  .seg input { position: absolute; opacity: 0; pointer-events: none; }
  .seg label { padding: 3px 9px; border-radius: 6px; font: 500 12.5px/1.4 var(--mono); color: var(--muted); cursor: pointer; }
  .seg input:checked + label { background: var(--chip); color: var(--text); box-shadow: inset 0 0 0 1px var(--border-strong); }
  .seg input:focus-visible + label { outline: 2px solid var(--accent); }
  .no-js .js-only { display: none !important; }

  /* Table */
  .table-wrap { border: 1px solid var(--border); border-radius: 10px; background: var(--surface); box-shadow: var(--shadow); }
  table { width: 100%; border-collapse: separate; border-spacing: 0; font-variant-numeric: tabular-nums; }
  th, td { padding: 8px 10px; text-align: left; vertical-align: middle; border-bottom: 1px solid var(--border); background: var(--row, var(--surface)); }
  td { position: relative; }
  tbody tr:last-child > * { border-bottom: 0; }
  tbody tr:nth-child(even of :not([hidden])) { --row: var(--zebra); }
  tbody tr:hover { --row: var(--hover); }
  thead th { position: sticky; top: 0; z-index: 2; background: var(--head); padding: 0; font-size: 12px; font-weight: 600; color: var(--muted); white-space: nowrap; border-bottom-color: var(--border-strong); }
  thead th:first-child { border-top-left-radius: 10px; }
  thead th:last-child { border-top-right-radius: 10px; }
  thead th button, thead th > span:not(.sr) { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 4px; width: 100%; padding: 9px 10px; cursor: pointer; }
  thead th.num button { justify-content: flex-end; }
  thead th button:hover { color: var(--text); }
  thead th button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  thead th code { font-size: 11.5px; }
  .arrow { width: 8px; display: inline-block; color: var(--accent-text); }
  th[aria-sort="ascending"] .arrow::after { content: "\\2191"; }
  th[aria-sort="descending"] .arrow::after { content: "\\2193"; }
  th[aria-sort] button { color: var(--text); }
  .num { text-align: right; white-space: nowrap; }
  .num small { color: var(--faint); }
  .na { color: var(--faint); }
  .c-runner { position: sticky; left: 0; z-index: 1; min-width: 190px; }
  thead th.c-runner { z-index: 3; }
  tbody th.c-runner { font-weight: 400; }
  .prov { display: inline-flex; align-items: center; gap: 5px; padding: 1px 7px 1px 6px; border: 1px solid var(--chip-border); border-radius: 5px; background: var(--chip); color: var(--muted); font-size: 11.5px; font-weight: 500; line-height: 18px; white-space: nowrap; }
  .prov i { width: 7px; height: 7px; border-radius: 50%; background: var(--p0); }
  .prov[data-p="1"] i { background: var(--p1); } .prov[data-p="2"] i { background: var(--p2); }
  .prov[data-p="3"] i { background: var(--p3); } .prov[data-p="4"] i { background: var(--p4); }
  .prov[data-p="5"] i { background: var(--p5); }
  .rid { display: block; margin-top: 3px; font: 600 13px/1.3 var(--mono); color: var(--text); white-space: nowrap; }
  .c-labels { min-width: 310px; }
  @media (max-width: 640px) { .c-labels { min-width: 280px; } }
  .labels { display: flex; flex-wrap: wrap; gap: 4px; }
  .lbl { font: 12px/18px var(--mono); padding: 1px 6px; border: 1px solid var(--chip-border); border-radius: 5px; background: var(--chip); color: var(--text); cursor: copy; white-space: nowrap; }
  .lbl:hover { border-color: var(--accent); color: var(--accent-text); }
  .lbl.copied { background: var(--accent-soft); border-color: var(--accent); color: var(--accent-text); }
  .no-js .lbl { cursor: text; user-select: all; }
  .tag { display: inline-block; padding: 0 7px; border-radius: 5px; border: 1px solid var(--chip-border); font-size: 12px; line-height: 20px; color: var(--muted); white-space: nowrap; }
  .tag.mono { font-size: 11.5px; }
  .c-price { min-width: 110px; }
  .price { display: inline-flex; flex-direction: column; align-items: flex-end; line-height: 1.25; }
  .price .pm { font: 650 14px/1.3 var(--mono); color: var(--text); }
  .price .ph { font: 12px/1.3 var(--mono); color: var(--faint); }
  .price small { font-weight: 400; color: var(--faint); font-size: 11px; }
  body:has(#u-h:checked) .price .ph { order: -1; font: 650 14px/1.3 var(--mono); color: var(--text); }
  body:has(#u-h:checked) .price .pm { font: 12px/1.3 var(--mono); color: var(--faint); }
  .c-free { text-align: center; }
  thead th:nth-last-child(3) button { justify-content: center; }
  .yes { color: var(--accent-text); font-size: 16px; display: inline-flex; }
  .c-date { font: 12px var(--mono); color: var(--muted); white-space: nowrap; }
  .c-src { width: 1%; text-align: center; }
  .c-src a { display: inline-flex; padding: 4px; border-radius: 5px; color: var(--faint); }
  .c-src a:hover { color: var(--accent-text); background: var(--chip); }
  .empty td { text-align: center; color: var(--muted); padding: 28px; }
  .note { margin: 12px 2px 0; color: var(--faint); font-size: 12.5px; max-width: 90ch; }
  .toast { position: fixed; left: 50%; bottom: 20px; transform: translate(-50%, 20px); opacity: 0; transition: opacity .15s, transform .15s; background: var(--text); color: var(--bg); padding: 6px 12px; border-radius: 8px; font-size: 13px; pointer-events: none; }
  .toast.show { opacity: 1; transform: translate(-50%, 0); }
  .toast code { font-size: 12px; }

  /* Footer */
  footer { border-top: 1px solid var(--border); color: var(--faint); font-size: 12.5px; }
  footer .wrap { display: flex; flex-wrap: wrap; gap: 8px 24px; justify-content: space-between; padding-top: 18px; padding-bottom: 28px; }
  footer p { margin: 0; }
  footer a { color: var(--muted); }

  @media (max-width: 1180px) {
    .table-wrap { overflow: auto; max-height: calc(100dvh - 24px); overscroll-behavior-x: contain; }
  }
  @media (max-width: 640px) {
    .wrap { padding: 0 14px; }
    .top { padding-top: 14px; padding-bottom: 14px; }
    .top { gap: 10px; }
    a.cta { margin-left: auto; }
    nav.links { order: 3; flex-basis: 100%; margin-left: -10px; gap: 0; }
    .hero { padding-top: 20px; padding-bottom: 18px; }
    .search { max-width: none; flex-basis: 100%; }
    .spacer { display: none; }
    .table-wrap { margin: 0 -14px; border-radius: 0; border-left: 0; border-right: 0; }
    thead th:first-child, thead th:last-child { border-radius: 0; }
    th, td { padding: 8px 10px; }
    .c-runner { min-width: 0; box-shadow: 1px 0 0 var(--border); }
    .rid { font-size: 12px; }
  }
  @media (prefers-reduced-motion: reduce) { .toast { transition: none; } }
</style>
</head>
<body>
<header class="site">
  <div class="wrap top">
    <a class="brand" href="./" aria-label="runnerdb home">${logoSVG('#4338ca').replace('<svg ', '<svg aria-hidden="true" ')}<b>runnerdb</b></a>
    <nav class="links" aria-label="Project">
      <a href="${REPO}">${icon.gh}GitHub</a>
      <a href="api.json"><code>api.json</code></a>
      <a href="schema.json"><code>schema.json</code></a>
    </nav>
    <a class="cta" href="${REPO}/blob/main/CONTRIBUTING.md">Add or fix a price</a>
  </div>
</header>
<section class="wrap hero">
  <h1>What does a CI runner cost?</h1>
  <p>Open data on CI runner prices, specs and billing rules: what each <code>runs-on</code> label costs per minute, what hardware it gets and how the provider bills it.</p>
  <ul class="stats">
    <li><b>${providers.length}</b> providers</li>
    <li><b>${items.length}</b> runners</li>
    <li><b>${labelCount}</b> labels</li>
    <li>data as of <b class="mono">${esc(api.as_of)}</b></li>
  </ul>
</section>
<main class="wrap">
  <div class="toolbar">
    <label class="search js-only"><span class="sr">Filter runners</span>${icon.search}<input id="q" type="search" placeholder="Filter by label, provider, OS…" autocomplete="off" spellcheck="false"></label>
    <div class="chips js-only" role="group" aria-label="Provider">${providers.map((p) => chip('provider', p.id, esc(shortName(p)))).join('')}</div>
    <div class="chips js-only" role="group" aria-label="Operating system">${osList.map((os) => chip('os', os, OS[os])).join('')}</div>
    <span class="spacer"></span>
    <span class="count js-only" id="count" aria-live="polite">${items.length} runners</span>
    <div class="seg" role="radiogroup" aria-label="Price unit">
      <input type="radio" name="unit" id="u-m" checked><label for="u-m">$/min</label>
      <input type="radio" name="unit" id="u-h"><label for="u-h">$/h</label>
    </div>
  </div>
  <div class="table-wrap">
    <table id="t">
      <thead><tr>${head}</tr></thead>
      <tbody id="rows">
${rowsHTML}
<tr class="empty" hidden><td colspan="${nCols}">No runners match these filters.</td></tr>
      </tbody>
    </table>
  </div>
  <p class="note">List prices in USD per runtime minute, before plan quotas, discounts and per-job rounding. Each price links to its source; confirm there before relying on a number. Click a label to copy it.</p>
</main>
<footer>
  <div class="wrap">
    <p>Data <a href="${REPO}/blob/main/DATA_LICENSE">CC0-1.0</a> (public domain) &middot; Code <a href="${REPO}/blob/main/LICENSE">MIT</a> &middot; Provider names are trademarks of their owners; not affiliated with any provider.</p>
    <p>Made by <a href="https://stamp.build">Stamp</a></p>
  </div>
</footer>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<script>
(function () {
  var tbody = document.getElementById('rows');
  var empty = tbody.querySelector('.empty');
  var rows = Array.prototype.slice.call(tbody.querySelectorAll('tr:not(.empty)'));
  var NUM = { vcpu: 1, mem: 1, price: 1, mult: 1, flex: 1, free: 1 };
  var sortKey = 'price', dir = 1;
  var q = document.getElementById('q'), count = document.getElementById('count');
  var picked = { provider: [], os: [] };

  function val(tr, k) {
    var v = tr.getAttribute('data-k-' + k);
    if (v === null || v === '') return null;
    return NUM[k] ? parseFloat(v) : v;
  }
  function sort() {
    rows.sort(function (a, b) {
      var x = val(a, sortKey), y = val(b, sortKey);
      if (x === y) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      return (x < y ? -1 : 1) * dir;
    });
    rows.forEach(function (tr) { tbody.insertBefore(tr, empty); });
  }
  function filter() {
    var terms = q.value.toLowerCase().split(' ').filter(Boolean), shown = 0;
    rows.forEach(function (tr) {
      var hay = tr.getAttribute('data-q');
      var ok = terms.every(function (t) { return hay.indexOf(t) !== -1; }) &&
        (!picked.provider.length || picked.provider.indexOf(tr.getAttribute('data-provider')) !== -1) &&
        (!picked.os.length || picked.os.indexOf(tr.getAttribute('data-os')) !== -1);
      tr.hidden = !ok;
      if (ok) shown++;
    });
    empty.hidden = shown > 0;
    count.textContent = shown === rows.length ? rows.length + ' runners' : shown + ' of ' + rows.length + ' runners';
  }

  document.querySelectorAll('thead th[data-k] button').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var th = btn.parentNode, k = th.getAttribute('data-k');
      dir = k === sortKey ? -dir : 1;
      sortKey = k;
      document.querySelectorAll('thead th[aria-sort]').forEach(function (h) { h.removeAttribute('aria-sort'); });
      th.setAttribute('aria-sort', dir === 1 ? 'ascending' : 'descending');
      sort();
    });
  });
  document.querySelectorAll('.fchip').forEach(function (c) {
    c.addEventListener('click', function () {
      var on = c.getAttribute('aria-pressed') !== 'true', list = picked[c.getAttribute('data-group')], v = c.getAttribute('data-value');
      c.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (on) list.push(v); else list.splice(list.indexOf(v), 1);
      filter();
    });
  });
  q.addEventListener('input', filter);

  var toast = document.getElementById('toast'), timer;
  function copied(btn, text) {
    btn.classList.add('copied');
    toast.textContent = 'Copied ' + text;
    toast.classList.add('show');
    clearTimeout(timer);
    timer = setTimeout(function () { toast.classList.remove('show'); btn.classList.remove('copied'); }, 1400);
  }
  tbody.addEventListener('click', function (e) {
    var btn = e.target.closest('.lbl');
    if (!btn) return;
    var text = btn.getAttribute('data-copy');
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { copied(btn, text); }, function () {});
    } else {
      var r = document.createRange(); r.selectNodeContents(btn);
      var s = getSelection(); s.removeAllRanges(); s.addRange(r);
      try { if (document.execCommand('copy')) copied(btn, text); } catch (err) {}
    }
  });
})();
</script>
</body>
</html>
`;
}
