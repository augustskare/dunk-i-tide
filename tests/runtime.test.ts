import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createWorker } from "./helpers/worker.ts";

let worker: Awaited<ReturnType<typeof createWorker>>;
let municipality = "3201";
let missingState = false;
let noDates = false;
let calls: string[] = [];
let postedAddress: Record<string, string> = {};

before(async () => {
  worker = await createWorker(async (request) => {
    const url = new URL(request.url);
    calls.push(url.hostname);
    if (url.hostname === "ws.geonorge.no") {
      assert.equal(url.searchParams.get("sok"), "Åsvegen 12B");
      assert.equal(url.searchParams.has("kommunenummer"), false);
      return Response.json({ adresser: [{
        adressenavn: "Åsvegen", adressekode: 1234, nummer: 12,
        bokstav: "B", kommunenummer: municipality,
      }] });
    }
    if (url.hostname === "norkartrenovasjon.azurewebsites.net") {
      assert.equal(request.headers.get("Kommunenr"), municipality);
      const endpoint = url.searchParams.get("server")!;
      if (endpoint.endsWith("fraksjoner")) {
        return Response.json([{ Id: 8, Navn: "Papp og papir" }]);
      }
      assert.equal(url.searchParams.get("gatenavn"), "Åsvegen");
      assert.equal(url.searchParams.get("husnr"), "12B");
      return Response.json([{ FraksjonId: 8, Tommedatoer: ["2027-01-02T00:00:00"] }]);
    }
    assert.equal(url.hostname, "remiks.no");
    if (url.pathname === "/privat/tommekalender") {
      // Exercise real HTML parsing with irrelevant and malformed JSON before state.
      const state = { state: { "min-renovasjon": {
        ajaxUrl: "https://remiks.no/wp-admin/admin-ajax.php", nonce: "test-nonce",
      } } };
      return new Response(`<html><script type="application/json">not json</script>
        <script type="application/json">{"unrelated":true}</script>
        ${missingState ? "" : `<script type="application/json">${JSON.stringify(state)}</script>`}
        </html>`, { headers: { "Content-Type": "text/html" } });
    }
    assert.equal(url.pathname, "/wp-admin/admin-ajax.php");
    assert.equal(request.method, "POST");
    postedAddress = Object.fromEntries(await request.formData()) as Record<string, string>;
    if (noDates) return Response.json({ success: true, data: {
      message: "Finner ingen tilgjengelige datoer for denne adressen.",
    } });
    return Response.json({ success: true, data: [
      { fraksjonId: 1, tommedatoer: ["2. januar"] },
      { fraksjonId: 4, tommedatoer: ["3. januar"] },
    ] });
  });
});

after(async () => { await worker?.dispose(); });

const query = "?q=" + encodeURIComponent("Åsvegen 12B");

test("bundled Worker serves a Norkart calendar through its actual HTTP handler", async () => {
  municipality = "3405";
  calls = [];
  const response = await worker.fetch(query);
  const calendar = await response.text();
  assert.equal(response.status, 200, calendar);
  assert.match(calendar, /BEGIN:VEVENT/);
  assert.match(calendar, /SUMMARY:Papp og papir/);
  assert.match(calendar, /DTSTART;VALUE=DATE:20270102/);
  assert.equal(calls.filter((host) => host === "norkartrenovasjon.azurewebsites.net").length, 2);
  assert.equal(calls.includes("remiks.no"), false);
});

for (const remiksMunicipality of ["5501", "5534"]) {
  test(`municipality ${remiksMunicipality} retains Remiks routing, HTML parsing and form submission`, async () => {
    municipality = remiksMunicipality;
    calls = [];
    missingState = false;
    const response = await worker.fetch(query);
    const calendar = await response.text();
    assert.equal(response.status, 200, calendar);
    assert.match(calendar, /SUMMARY:Optisk sortert avfall/);
    assert.match(calendar, /SUMMARY:Glass- og metallemballasje/);
    assert.equal((calendar.match(/BEGIN:VEVENT/g) ?? []).length, 2);
    assert.equal(calls.includes("norkartrenovasjon.azurewebsites.net"), false);
    assert.deepEqual(postedAddress, {
      security: "test-nonce", action: "min_reno/request",
      streetName: "Åsvegen", streetCode: "1234", houseNumber: "12B",
      munNumber: remiksMunicipality, targetEndpoint: "dates",
    });
  });
}

test("missing Remiks page state fails rather than returning a calendar", async () => {
  municipality = "5501";
  missingState = true;
  const response = await worker.fetch(query);
  assert.equal(response.status, 400);
  assert.equal(await response.text(), "JSON script tag not found");
});

test("Remiks no-dates response produces its useful message rather than a TypeError", async () => {
  municipality = "5501";
  missingState = false;
  noDates = true;
  try {
    const response = await worker.fetch(query);
    assert.equal(response.status, 400);
    assert.equal(await response.text(), "Finner ingen tilgjengelige datoer for denne adressen.");
  } finally { noDates = false; }
});
