import assert from "node:assert/strict";
import { test } from "node:test";
import worker from "../index.ts";

async function withFetch(mock: typeof fetch, run: () => Promise<void>) {
  const original = globalThis.fetch;
  globalThis.fetch = mock;
  try { await run(); } finally { globalThis.fetch = original; }
}

function upstream(options: { municipality?: string; empty?: boolean; invalidDate?: boolean; status?: number } = {}): typeof fetch {
  return async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === "ws.geonorge.no") {
      assert.equal(url.searchParams.has("kommunenummer"), false);
      return Response.json({ adresser: [{
        adressenavn: "Rådhustorget", adressekode: 2469, nummer: 2,
        bokstav: "A", kommunenummer: options.municipality ?? "3201",
      }] });
    }
    assert.equal(url.hostname, "norkartrenovasjon.azurewebsites.net");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("Kommunenr"), options.municipality ?? "3201");
    assert.ok(headers.get("RenovasjonAppKey"));
    if (options.status) return new Response("Unavailable", { status: options.status });
    const server = url.searchParams.get("server")!;
    if (server.endsWith("fraksjoner")) {
      return Response.json([{ Id: 1, Navn: "Papir" }, { Id: 2, Navn: "Matavfall" }]);
    }
    assert.ok(server.endsWith("tommekalender?kommunenr=" + (options.municipality ?? "3201")));
    assert.equal(url.searchParams.get("gatenavn"), "Rådhustorget");
    assert.equal(url.searchParams.get("husnr"), "2A");
    assert.equal(url.searchParams.get("gatekode"), "2469");
    return Response.json(options.empty ? [] : [
      { FraksjonId: 1, Tommedatoer: [options.invalidDate ? "2027-02-30T00:00:00" : "2027-01-02T00:00:00"] },
      { FraksjonId: 2, Tommedatoer: ["2027-01-02T00:00:00"] },
    ]);
  };
}

const request = () => worker.fetch(new Request("https://calendar.example/?q=Rådhustorget+2A"), {} as never, {} as never);

test("missing address query remains a 400", async () => {
  const response = await worker.fetch(new Request("https://calendar.example/"), {} as never, {} as never);
  assert.equal(response.status, 400);
  assert.equal(await response.text(), "Missing query parameter");
});

for (const municipality of ["3201", "3405", "0301"]) {
  test(`looks up municipality ${municipality} nationwide and returns named, distinct calendar events`, async () => {
    await withFetch(upstream({ municipality }), async () => {
      const response = await request();
      assert.equal(response.status, 200);
      const calendar = await response.text();
      assert.match(calendar, /BEGIN:VCALENDAR/);
      assert.match(calendar, /SUMMARY:Papir/);
      assert.match(calendar, /SUMMARY:Matavfall/);
      assert.match(calendar, /DTSTART;VALUE=DATE:20270102/);
      const ids = [...calendar.matchAll(/^UID:(.+)$/gm)].map((match) => match[1]);
      assert.equal(ids.length, 2);
      assert.equal(new Set(ids).size, 2);
    });
  });
}

test("empty calendars do not silently imply municipality coverage", async () => {
  await withFetch(upstream({ empty: true }), async () => {
    const response = await request();
    assert.equal(response.status, 400);
    assert.match(await response.text(), /No collection dates/);
  });
});

test("upstream failures report that coverage is unconfirmed", async () => {
  await withFetch(upstream({ status: 503 }), async () => {
    const response = await request();
    assert.equal(response.status, 400);
    assert.match(await response.text(), /HTTP 503.*coverage could not be confirmed/);
  });
});

test("rejects invalid upstream collection dates", async () => {
  await withFetch(upstream({ invalidDate: true }), async () => {
    const response = await request();
    assert.equal(response.status, 400);
    assert.match(await response.text(), /Invalid collection date/);
  });
});

test("an address with no matches does not request collection data", async () => {
  let calls = 0;
  await withFetch(async () => {
    calls++;
    return Response.json({ adresser: [] });
  }, async () => {
    const response = await request();
    assert.equal(response.status, 400);
    assert.equal(await response.text(), "Address not found");
    assert.equal(calls, 1);
  });
});
