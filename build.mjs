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
  const rows = Object.values(api.providers).flatMap((p) =>
    Object.values(p.runners).map((r) => ({
      provider: p.name,
      id: r.id,
      labels: r.labels.join(' '),
      os: r.os,
      arch: r.arch,
      vcpu: r.vcpu,
      memory_gb: r.memory_gb ?? null,
      price: r.price_usd_per_minute,
      multiplier: r.multiplier ?? null,
      public_free: r.public_repo_free,
      flex: r.scheduling_discounts?.flex ?? null,
      as_of: r.as_of,
      source: r.source_url,
    })),
  );
  // Escape "<" so data can never close the <script> tag.
  const data = JSON.stringify(rows).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>runnerdb: CI runner prices</title>
<style>
  :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
  body { margin: 2rem auto; max-width: 1200px; padding: 0 1rem; }
  table { border-collapse: collapse; width: 100%; font-size: 0.9rem; }
  th, td { padding: 0.35rem 0.6rem; border-bottom: 1px solid #8884; text-align: left; vertical-align: top; }
  th { cursor: pointer; user-select: none; white-space: nowrap; position: sticky; top: 0; background: Canvas; }
  th[aria-sort="ascending"]::after { content: " \\25B2"; }
  th[aria-sort="descending"]::after { content: " \\25BC"; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  code { font-size: 0.85em; }
  input { padding: 0.35rem; width: 20rem; max-width: 100%; margin-bottom: 1rem; }
</style>
</head>
<body>
<h1>runnerdb</h1>
<p>Open dataset of CI runner prices, specs and billing rules. Data as of ${api.as_of}.
JSON: <a href="api.json">api.json</a> &middot; <a href="schema.json">schema.json</a></p>
<p>Prices are list prices in USD per runtime minute, before plan quotas, discounts and per-job rounding. Click a column to sort.</p>
<input id="q" type="search" placeholder="Filter (provider, label, os...)" aria-label="Filter">
<table>
<thead><tr>
  <th data-k="provider">Provider</th><th data-k="id">Runner</th><th data-k="labels">runs-on labels</th>
  <th data-k="os">OS</th><th data-k="arch">Arch</th><th data-k="vcpu">vCPU</th><th data-k="memory_gb">RAM GB</th>
  <th data-k="price">$/min</th><th data-k="price">$/hour</th><th data-k="multiplier">Multiplier</th>
  <th data-k="flex">Flex</th><th data-k="public_free">Free on public repos</th><th data-k="as_of">Verified</th>
</tr></thead>
<tbody id="rows"></tbody>
</table>
<script>
const DATA = ${data};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const dash = (v, f = (x) => x) => (v === null || v === undefined ? '&ndash;' : esc(f(v)));
const usd = (x) => '$' + (+x.toFixed(4)).toString();
let sortKey = 'price', dir = 1;
function render() {
  const q = document.getElementById('q').value.toLowerCase();
  const rows = DATA.filter((r) => !q || Object.values(r).join(' ').toLowerCase().includes(q));
  rows.sort((a, b) => {
    const x = a[sortKey], y = b[sortKey];
    if (x === y) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    return (x < y ? -1 : 1) * dir;
  });
  document.getElementById('rows').innerHTML = rows.map((r) => '<tr>' +
    '<td>' + esc(r.provider) + '</td>' +
    '<td><a href="' + esc(r.source) + '">' + esc(r.id) + '</a></td>' +
    '<td>' + r.labels.split(' ').map((l) => '<code>' + esc(l) + '</code>').join('<br>') + '</td>' +
    '<td>' + esc(r.os) + '</td><td>' + esc(r.arch) + '</td>' +
    '<td class="num">' + dash(r.vcpu) + '</td><td class="num">' + dash(r.memory_gb) + '</td>' +
    '<td class="num">' + usd(r.price) + '</td><td class="num">' + usd(r.price * 60) + '</td>' +
    '<td class="num">' + dash(r.multiplier, (m) => m + 'x') + '</td>' +
    '<td class="num">' + dash(r.flex, (f) => f + 'x') + '</td>' +
    '<td>' + (r.public_free ? 'yes' : 'no') + '</td><td>' + esc(r.as_of) + '</td></tr>').join('');
  document.querySelectorAll('th').forEach((th) => th.removeAttribute('aria-sort'));
}
document.querySelectorAll('th').forEach((th) => th.addEventListener('click', () => {
  const k = th.dataset.k;
  dir = k === sortKey ? -dir : 1;
  sortKey = k;
  render();
  th.setAttribute('aria-sort', dir === 1 ? 'ascending' : 'descending');
}));
document.getElementById('q').addEventListener('input', render);
render();
</script>
</body>
</html>
`;
}
