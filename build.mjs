#!/usr/bin/env node
// runnerdb build: validates providers/**.json against schema/*.json and writes the data files in dist/.
//
//   node build.mjs           validate, then write dist/api.json and dist/schema.json
//                            (the page itself is built by site/: npm run build --prefix site)
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
    if (runner.specs_url !== undefined && runner.specs_url === runner.source_url) fail(rFile, 'specs_url equals source_url; omit it (source_url then backs the specs too)');
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
    if (provider.billing.unit === 'flat') {
      if (!runner.flat_fee) fail(rFile, 'provider billing.unit is "flat"; "flat_fee" is required');
      if (runner.price_usd_per_minute !== 0) fail(rFile, 'provider billing.unit is "flat" but price_usd_per_minute is not 0');
    } else if (runner.flat_fee) {
      fail(rFile, '"flat_fee" set but provider billing.unit is not "flat"');
    }
    if (runner.flat_fee && runner.flat_fee.amount_usd !== undefined && runner.flat_fee.period === undefined) {
      fail(rFile, 'flat_fee.amount_usd needs flat_fee.period');
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

console.log(`wrote ${['api.json', 'schema.json'].map((f) => rel(path.join(DIST, f))).join(', ')}`);
// The web page (dist/index.html + dist/assets/) is built by the Vite app in site/,
// which embeds dist/api.json at build time: `npm ci --prefix site && npm run build --prefix site`.

