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
The Android app binary has not been inspected. Live Norkart calendars have been
verified for Rådhustorget 2 in Sandvika, Åsmarkvegen 111 in Lillehammer,
Storgata 94B in Tromsø, and Tennvasslia 10 in Hansnes (Karlsøy).
This does not establish coverage for every address or municipality.
Storgata 1 in Tromsø returns no collection dates and is tested as an explicit error.
The application no longer contacts or scrapes the Remiks website.

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
calendar names, dates and UIDs, and upstream failures. Page tests execute the
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
