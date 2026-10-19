import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createWorker } from "./helpers/worker.ts";

let worker: Awaited<ReturnType<typeof createWorker>>;
let municipality = "3201";
let calls: string[] = [];

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
    throw new Error(`Unexpected outbound request: ${url}`);
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

for (const municipalityNumber of ["5501", "5534"]) {
  test(`municipality ${municipalityNumber} uses Norkart without contacting Remiks`, async () => {
    municipality = municipalityNumber;
    calls = [];
    const response = await worker.fetch(query);
    const calendar = await response.text();
    assert.equal(response.status, 200, calendar);
    assert.match(calendar, /SUMMARY:Papp og papir/);
    assert.equal(calls.filter((host) => host === "norkartrenovasjon.azurewebsites.net").length, 2);
    assert.equal(calls.includes("remiks.no"), false);
  });
}
