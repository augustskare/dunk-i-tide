# Dunk i tide

A Cloudflare Worker with an address lookup page at `/` (also `/index.html`).
Enter an address to get a calendar download and subscription link. Direct
address queries (`?q=street+number+city`) return an iCalendar waste collection
calendar as before.

## Coverage

Address search uses Geonorge across Norway. All collection dates use
Min Renovasjon / Norkart, including Tromsø (5501) and Karlsøy (5534).
Nationwide address lookup does **not** mean every municipality has collection
data: municipalities using other providers still need separate integrations.
A failed request or empty Norkart calendar is reported as an error.
Waste fraction names come from the selected municipality's API.

The Norkart API contract and public client identifier were referenced from the
[Waste Collection Schedule integration](https://github.com/mampfes/hacs_waste_collection_schedule/blob/master/custom_components/waste_collection_schedule/waste_collection_schedule/source/minrenovasjon_no.py)
and [Home Assistant Min Renovasjon integration](https://github.com/Danielhiversen/home_assistant_min_renovasjon).
The Android app binary has not been inspected. The public Norkart web client's
[API definitions](https://norkartrenovasjon.azurewebsites.net/Renovation/URL/URL.js)
confirm the shared client identifier, customer registry and service discovery.

Visit `/coverage` for a searchable, dated municipality report, including
verified sample calendars, inconclusive checks and municipalities absent from
Norkart's registry. `/coverage.json` contains the full results, source URLs,
attempted addresses and errors. A successful sample verifies that address on
the check date; it does not establish every address in the municipality works.
Registry absence is not proof that no Norkart data exists. Address queries remain
available for all municipalities.

The application no longer contacts or scrapes the Remiks website.
See [coverage research](docs/coverage-research.md) for official provider evidence.

## Development

Use Node.js 24 (Node.js 22+ required by Wrangler).

```sh
npm ci
npm run typecheck
npm test
npm run dev
```

No Cloudflare account is needed for local development. Outbound HTTPS access is
needed to `ws.geonorge.no` and `norkartrenovasjon.azurewebsites.net`. Norkart's proxy targets
`komteksky.norkart.no`. The shared client identifier is not a personal credential.

Check local startup by requesting `/`: expect HTTP 200 and the address lookup
page. `/?q=` must return HTTP 400 and `Missing query parameter`.
For a live functional check, request
`/?q=Rådhustorget%202%20Sandvika` and verify HTTP 200 and an ICS calendar with
`BEGIN:VCALENDAR` and `BEGIN:VEVENT`. This live check requires upstream access
and collection data for the address.

## Tests

`npm test` bundles the real Worker and runs it in Cloudflare's workerd runtime.
Only outbound HTTP responses are simulated. Tests cover nationwide address
queries, Norkart routing for Tromsø and Karlsøy,
calendar names, exclusive next-day event ends (including leap days and year
boundaries), UIDs, and upstream failures. Coverage tests verify report accounting
and execute the actual coverage page script to check filtering and sample links. Page tests execute the
actual lookup script in Happy DOM and follow its download link back through the
Worker. They also cover blank input, upstream and network errors, and stale-link
removal.

`npm run test:live` uses real Geonorge and Norkart requests. It requires
network access and can fail when providers are unavailable. The no-dates case
requires an explicit error response. Node's `--use-env-proxy` supports cloud proxy settings for
these tests; normal public network access also works.

GitHub Actions runs types and deterministic runtime/page tests on pushes and
pull requests. Manually run the Tests workflow to also execute the live checks.

Validate the Worker bundle without deploying:

```sh
npm exec wrangler deploy -- --dry-run --outdir /tmp/dunk-i-tide-build
```

## Reproduce the coverage audit

```sh
npm run audit:coverage
```

This fetches the current Geonorge municipality list and Norkart customer registry,
then tests up to three sample addresses per registered municipality through
the bundled Worker in workerd, prioritizing the four known live-test addresses
before Geonorge samples. Address checks run sequentially, paced two seconds
apart, with one retry after a 35-second HTTP 429 backoff. Calendars
must have named events, unique municipality-specific UIDs and at least one
current or future collection date. Set `COVERAGE_SAMPLE_SIZE` to a value from 1 to
10 for a larger sample.
Progress is saved after each municipality; use `npm run audit:coverage -- --resume`
to retain today's verified samples and retry other results. Add `--only=3405,5501`
to recheck selected municipalities in today's report. The audit writes `docs/coverage.json`;
review and commit it to update the public coverage page. An inconclusive result
is recorded rather than treated as proof that the municipality is unsupported.
The audit requires network access and can take several minutes.
