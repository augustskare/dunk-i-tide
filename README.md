# Dunk i tide

A Cloudflare Worker that turns an address query (`?q=street+number+city`) into
an iCalendar waste collection calendar.

## Coverage

Address search uses Geonorge across Norway. Collection dates use Remiks for
Tromsø (5501) and Karlsøy (5534), and Min Renovasjon / Norkart for other
municipalities. Nationwide address lookup does **not** mean every municipality
has collection data: municipalities using other providers still need separate
integrations. A failed request or empty Norkart calendar is reported as an error.
Waste fraction names come from the selected municipality's API.

The Norkart API contract and public client identifier were referenced from the
[Waste Collection Schedule integration](https://github.com/mampfes/hacs_waste_collection_schedule/blob/master/custom_components/waste_collection_schedule/waste_collection_schedule/source/minrenovasjon_no.py)
and [Home Assistant Min Renovasjon integration](https://github.com/Danielhiversen/home_assistant_min_renovasjon).
The Android app binary has not been inspected. Live Norkart requests and
municipality coverage have not yet been verified in this environment because
outbound network access is restricted. Tests use simulated upstream responses.

## Development

Use Node.js 24 (Node.js 22+ required by Wrangler).

```sh
npm ci
npm run typecheck
node --test tests/calendar.test.ts
npm run dev
```

No Cloudflare account is needed for local development. Outbound HTTPS access is
needed to `ws.geonorge.no`, `remiks.no` (including a possible `www.remiks.no`
redirect), and `norkartrenovasjon.azurewebsites.net`. Norkart's proxy targets
`komteksky.norkart.no`. The shared client identifier is not a personal credential.

Check local startup by requesting `/`: expect HTTP 400 and
`Missing query parameter`. For a live functional check, request
`/?q=Rådhustorget%202%20Sandvika` and verify HTTP 200 and an ICS calendar with
`BEGIN:VCALENDAR` and `BEGIN:VEVENT`. This live check requires upstream access
and collection data for the address.

Validate the Worker bundle without deploying:

```sh
npm exec wrangler deploy -- --dry-run --outdir /tmp/dunk-i-tide-build
```
