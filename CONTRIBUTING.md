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
