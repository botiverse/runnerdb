# Contributing

Thanks for helping keep CI prices honest.

## Rules

1. **One PR per price change** (or per new provider). Small PRs are easy to verify.
2. **Every number needs a source.** Set `source_url` to a public page that shows the price, and set `verified_as_of` to the date you checked it (`YYYY-MM-DD`).
3. **Don't guess.** If you can't verify a field, leave it out (optional fields) or use `null` (`vcpu`), and explain in `notes`. Use `billing.rounding: "unknown"` when you don't know how the provider rounds.
4. **List prices only.** No plan quotas, startup credits or negotiated discounts in `price_usd_per_minute`; mention them in `notes` or `free_tier.notes`.
5. Re-verifying an unchanged price is welcome: bump `verified_as_of` and keep the same `source_url`.

## Adding a provider

```
providers/<provider-id>/provider.json
providers/<provider-id>/runners/<runner-id>.json
```

Copy an existing provider as a template. IDs are lowercase `a-z0-9-`, and a runner's `id` must match its file name. Field reference: [README](README.md#layout) and `schema/`.

Every provider also needs a fetcher for the daily price check (see below). If prices can't be read automatically, add the provider to `NO_FETCHER` in `scripts/fetch-prices.mjs` with a reason. Otherwise the daily check fails.

## Adding or fixing a price fetcher

`scripts/fetch-prices.mjs` has a `FETCHERS` object keyed by provider ID. A fetcher has three parts:

```js
example: {
  // runner.source_url values this fetcher verifies. A runner citing any other URL fails the check,
  // so verified_as_of is never bumped against a page the script didn't read.
  sourceUrls: ['https://example.com/pricing'],
  // Download the official source and return Map<key, { price, name, multiplier? }>.
  // Prefer a markdown/JSON version the provider publishes; otherwise parse the HTML
  // with the htmlTables()/mdTables()/pageText() helpers. No dependencies.
  async fetch() {
    const offers = new Map();
    for (const t of htmlTables(await get('https://example.com/pricing'))) {
      for (const [size, price] of t.rows) if (usd(price) !== undefined) offers.set(`${t.heading}|${size}`, { price: usd(price), name: size });
    }
    return offers;
  },
  // Map a runner file to its key, or to a list of candidate keys (e.g. r.labels).
  keyFor: (r) => `${r.os}-${r.arch}-${r.vcpu}`,
  // Optional: regexes for keys that are deliberately not in runnerdb, so they aren't listed as new SKUs.
  ignore: [],
},
```

Rules:

- Fail rather than guess. If the page no longer has a runner's price, the run must fail. Don't fall back to the old value. Use `need(condition, message)` for anything else the data depends on, such as a flat fee or a billing model mentioned in `notes`.
- Fetch with `get(url)` for HTML or `get(url, { as: 'markdown' })` for markdown. Some sites serve markdown instead of HTML when the `Accept` header lists it.
- For multiplier-billed providers (`billing.base_rate_usd`), the script recalculates `multiplier` from the new price. If the page's own multiplier implies a different base rate, it fails, and `provider.json` has to be updated by hand.
- Test with `node scripts/fetch-prices.mjs --provider <id> --dry-run`, then `node build.mjs --check`.

## Before opening the PR

```sh
node build.mjs --check
```

CI runs the same command. It validates against the schemas and also checks that:

- runner `id` matches the file name
- no `runs-on` label (or `*` pattern) is claimed by two runners
- `price_usd_per_minute == base_rate_usd × multiplier` for multiplier-billed providers
- `verified_as_of` is a real date and not in the future

By contributing you agree that data changes are released under CC0-1.0 and code changes under MIT.
