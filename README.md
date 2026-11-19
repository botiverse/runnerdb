# runnerdb

An open, static dataset of **CI runner prices, specs and billing rules**: what a `runs-on:` label costs per minute, what hardware it gets, and how the provider bills it. It works like [models.dev](https://models.dev) does for LLMs, but for CI runners.

- Browse: <https://runnerdb.stamp.build>
- API: <https://runnerdb.stamp.build/api.json>
- Schema: <https://runnerdb.stamp.build/schema.json>

Every price has a `source_url` and a `verified_as_of` date, so you can see where a number came from and when someone last checked it.

## Coverage

| Provider | Directory | Runners |
| --- | --- | --- |
| GitHub-hosted | `providers/github` | Linux x64/ARM, Windows, macOS standard + macOS large/xlarge |
| Blacksmith | `providers/blacksmith` | Linux x64/ARM 2-32 vCPU, Windows 4-16 vCPU, macOS 6/12 vCPU |
| Depot | `providers/depot` | Linux x64/ARM 2-64 vCPU, Windows 2-64 vCPU, macOS 8 vCPU |
| Namespace | `providers/namespace` | Linux x64/ARM, Windows and macOS standard shapes (unit-minute billing) |
| Ubicloud | `providers/ubicloud` | Linux x64 standard + premium and ARM, 2-30 vCPU |
| WarpBuild | `providers/warpbuild` | Linux x64/ARM 2-32 vCPU, ARM on Apple Silicon, Windows 4-32 vCPU, macOS 6/12 vCPU |
| RunsOn | `providers/runs-on` | Flex predefined Linux runners. $0 per minute: you pay AWS directly plus a flat annual license |
| Cirrus Runners | `providers/cirrus-runners` | macOS, Linux x64/ARM, Linux GPU. $0 per minute: flat $150/month per concurrency unit |
| Self-hosted | `providers/self-hosted` | `self-hosted` ($0 platform charge; your infrastructure cost is not included) |

Providers that bill a flat fee or license instead of per minute (RunsOn, Cirrus Runners) have `billing.unit: "flat"`, `price_usd_per_minute: 0` and a `flat_fee` on each runner. The page shows them as "Flat fee" and sorts them after metered prices. Self-hosted (`billing.unit: "none"`) is shown as free. Each provider's `billing.notes` describes its real cost model.

**Wanted, contributions welcome:** GitLab SaaS runners, CircleCI, GitHub Linux/Windows larger runners and GPU runners. Please add only prices you can link to a public source. (BuildJet for GitHub Actions has shut down and is not listed.)

## Layout

```
providers/
  <provider-id>/
    provider.json            # provider + billing rules
    runners/
      <runner-id>.json       # one file per runner type
schema/
  provider.schema.json       # JSON Schema (draft 2020-12)
  runner.schema.json
build.mjs                    # validator + api.json/schema.json builder (no dependencies)
scripts/fetch-prices.mjs     # daily price check against the providers' pricing pages (no dependencies)
site/                        # the web page: Vite + React + Tailwind, shadcn/ui + TanStack Table
```

### `provider.json`

| Field | Required | Description |
| --- | --- | --- |
| `name` | yes | Display name |
| `homepage` | yes | https URL |
| `pricing_url` | yes | Official pricing page |
| `billing.unit` | yes | `minute`, `second`, `flat` (flat fee or license, not metered per minute: every runner has `flat_fee` and `price_usd_per_minute: 0`) or `none` (no charge, e.g. self-hosted) |
| `billing.rounding` | yes | `per_job_ceil` (each job rounded up to a whole unit), `per_second`, `none`, `unknown` |
| `billing.base_rate_usd` | no | For multiplier-based billing: USD per billing minute at 1x. Every runner must then set `multiplier`, and `price_usd_per_minute` must equal `base_rate_usd × multiplier` (the build checks this). |
| `billing.notes` | no | Free text |
| `public_repo_policy` | yes | `standard_runners_free`, `billed`, `not_applicable` |
| `free_tier` | no | `{ notes, minutes_per_month? }`. Informational only; never applied to prices. |
| `notes` | no | Free text |

### `runners/<runner-id>.json`

| Field | Required | Description |
| --- | --- | --- |
| `id` | yes | Must equal the file name (without `.json`) |
| `labels` | yes | Exact `runs-on` labels. `*` matches one or more characters (e.g. `macos-*-large`). A label can belong to only one runner across the whole dataset. |
| `os` | yes | `linux`, `windows`, `macos` |
| `os_version` | no | Image hint, e.g. `ubuntu-24.04` |
| `arch` | yes | `x64`, `arm64` |
| `vcpu` | yes | Integer, or `null` if not verified |
| `memory_gb`, `disk_gb` | no | Numbers |
| `gpu` | no | `{ model, count, memory_gb? }` |
| `price_usd_per_minute` | yes | List price per runtime minute, before plan quotas, discounts and rounding |
| `flat_fee` | with `billing.unit: "flat"` | `{ summary, amount_usd?, period?, notes? }`: `summary` is short display text (e.g. `$150/mo per concurrent job`); `amount_usd` is the fee per `period` (`month` or `year`) when one fixed amount applies. Required for, and only allowed on, flat-billed providers. |
| `multiplier` | no | Billing-minute multiplier (required when the provider sets `base_rate_usd`) |
| `public_repo_free` | yes | `true` if jobs from public repositories are not billed |
| `scheduling_discounts` | no | Price factors for optional modes, e.g. `{"flex": 0.6}` = 60% of list price |
| `source_url` | yes | https URL that backs the price |
| `verified_as_of` | yes | `YYYY-MM-DD` when the price was last checked against `source_url` |
| `notes` | no | Free text |

## Consuming the data

```sh
curl -s https://runnerdb.stamp.build/api.json | jq '.providers.github.runners["linux-2-core-x64"].price_usd_per_minute'
```

`api.json` shape:

```jsonc
{
  "$schema": "https://runnerdb.stamp.build/schema.json",
  "as_of": "2026-11-18",                  // newest verified_as_of in the dataset
  "providers": {
    "<provider-id>": {
      "id": "...", "name": "...", "billing": { ... }, ...,   // provider.json fields
      "as_of": "2026-11-18",              // newest verified_as_of among its runners
      "runners": {
        "<runner-id>": {
          ...,                            // runner file fields
          "provider": "<provider-id>",
          "as_of": "2026-11-18"           // = verified_as_of
        }
      }
    }
  }
}
```

To price a job: look up the runner whose `labels` match the job's `runs-on`, then compute `ceil(minutes) × price_usd_per_minute` when `billing.rounding` is `per_job_ceil`. Multiply by `scheduling_discounts.<mode>` if the job uses that mode, and check `public_repo_free` for public repositories. Plan quotas and negotiated discounts are out of scope.

Prices change. Use `as_of`/`verified_as_of` to decide how much to trust a number, and confirm against `source_url` before relying on it for anything that matters.

## Daily price check

A scheduled workflow ([`.github/workflows/daily-prices.yml`](.github/workflows/daily-prices.yml), daily at 06:17 UTC, or run it by hand from the Actions tab) runs [`scripts/fetch-prices.mjs`](scripts/fetch-prices.mjs). The script has one fetcher per provider. Each fetcher downloads the provider's official pricing source (a markdown or JSON version where the provider publishes one, otherwise the pricing page HTML) and reads every runner's price:

- **Price changed:** writes the new `price_usd_per_minute` (and `multiplier` for multiplier-billed providers) and sets `verified_as_of` to today.
- **Price unchanged:** sets `verified_as_of` to today.
- **Runner or price not found** (usually a page redesign): that provider's files are left untouched and the script exits non-zero. A stale price is never re-dated.
- **SKU on the pricing page but not in runnerdb:** listed in the summary, never added automatically.

The workflow then runs `node build.mjs --check` and opens or updates a pull request from `bot/daily-prices`, with the markdown summary as its body:

- Price changes are proposed the same day ("Update runner prices (N changed)").
- Date-only re-verifications are committed weekly, on Mondays or when the workflow is run by hand ("Re-verify prices (no changes)"). A daily PR that touches more than 100 files just to move a date would be noise, and a `verified_as_of` up to a week old is still recent enough. While a bot PR is open, it is refreshed every day. If the data matches the default branch again, the PR is closed.
- If any fetcher fails, the job still opens the PR for the providers that checked out, then fails, so GitHub notifies the maintainers.

Run it locally:

```sh
node scripts/fetch-prices.mjs --dry-run            # check everything, write nothing
node scripts/fetch-prices.mjs --provider depot     # check one provider and write the result
```

The workflow uses `GITHUB_TOKEN` and needs the repository setting **Allow GitHub Actions to create and approve pull requests** (Settings > Actions > General). PRs opened with `GITHUB_TOKEN` don't trigger other workflows, so `check.yml` won't run on them; the price workflow runs `node build.mjs --check` itself before it pushes.

## Contributing

Short version: **one PR per price change, with `source_url` and an updated `verified_as_of`.** See [CONTRIBUTING.md](CONTRIBUTING.md).

```sh
node build.mjs --check   # validate only (CI runs this)
node build.mjs           # validate + write dist/api.json, dist/schema.json
```

For data changes you need Node 18 or newer and nothing else; there is no `npm install`.

The web page lives in `site/` (Vite, React, Tailwind CSS, [shadcn/ui](https://ui.shadcn.com) components and [TanStack Table](https://tanstack.com/table)). It embeds `dist/api.json` at build time and writes `dist/index.html` and `dist/assets/` next to the JSON files. It needs Node 20.19 or newer:

```sh
npm ci --prefix site
npm run build --prefix site   # runs node build.mjs, then vite build into dist/
npm run dev --prefix site     # local dev server
```

Amplify runs the same two commands (see `amplify.yml`).

## License

- **Data** (`providers/`, `schema/`, generated `api.json` / `schema.json`): [CC0-1.0](DATA_LICENSE). Public domain; use it for anything.
- **Code** (`build.mjs`, `site/`, the generated page, workflow): [MIT](LICENSE). `site/src/components/ui/` is adapted from shadcn/ui (MIT).

- **Provider names and logos** (GitHub, Blacksmith, ...): trademarks of their respective owners, not covered by MIT or CC0. runnerdb is not affiliated with or endorsed by any provider; logos are used only to identify each provider. See [NOTICE](NOTICE).
