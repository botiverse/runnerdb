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
| Self-hosted | `providers/self-hosted` | `self-hosted` ($0 platform charge; your infrastructure cost is not included) |

**Wanted, contributions welcome:** Depot, Namespace, Ubicloud, RunsOn, BuildJet, Cirrus Runners, WarpBuild, GitLab SaaS runners, CircleCI, GitHub Linux/Windows larger runners and GPU runners. Please add only prices you can link to a public source.

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
build.mjs                    # validator + static site builder (no dependencies)
```

### `provider.json`

| Field | Required | Description |
| --- | --- | --- |
| `name` | yes | Display name |
| `homepage` | yes | https URL |
| `pricing_url` | yes | Official pricing page |
| `billing.unit` | yes | `minute`, `second` or `none` |
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

## Contributing

Short version: **one PR per price change, with `source_url` and an updated `verified_as_of`.** See [CONTRIBUTING.md](CONTRIBUTING.md).

```sh
node build.mjs --check   # validate only (CI runs this)
node build.mjs           # validate + write dist/api.json, dist/schema.json, dist/index.html
```

You need Node 18 or newer and nothing else; there is no `npm install`.

## License

- **Data** (`providers/`, `schema/`, generated `api.json` / `schema.json`): [CC0-1.0](DATA_LICENSE). Public domain; use it for anything.
- **Code** (`build.mjs`, generated `index.html`, workflow): [MIT](LICENSE).

Provider names are trademarks of their owners. runnerdb is not affiliated with any provider.
