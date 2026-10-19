import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { Window } from "happy-dom";
import { createWorker } from "./helpers/worker.ts";

let worker: Awaited<ReturnType<typeof createWorker>>;
let upstreamCalls = 0;
let failLookup = false;
before(async () => {
  worker = await createWorker(async (request) => {
    upstreamCalls++;
    const url = new URL(request.url);
    if (url.hostname === "ws.geonorge.no") {
      assert.equal(url.searchParams.get("sok"), "Rådhustorget 2A & Sandvika");
      if (failLookup) return new Response("Unavailable", { status: 503 });
      return Response.json({ adresser: [{
        adressenavn: "Rådhustorget", adressekode: 2469, nummer: 2,
        bokstav: "A", kommunenummer: "3201",
      }] });
    }
    if (url.searchParams.get("server")!.endsWith("fraksjoner")) {
      return Response.json([{ Id: 1, Navn: "Restavfall" }]);
    }
    return Response.json([{ FraksjonId: 1, Tommedatoer: ["2027-01-02T00:00:00"] }]);
  });
});
after(async () => { await worker?.dispose(); });

async function openPage() {
  const response = await worker.fetch("");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("Content-Type")!, /text\/html/);
  const window = new Window({
    url: "https://calendar.example/",
    settings: {
      enableJavaScriptEvaluation: true,
      disableJavaScriptFileLoading: true,
      // Only evaluate our checked-in page script, never upstream response code.
      suppressInsecureJavaScriptEnvironmentWarning: true,
    },
  });
  // Evaluate the actual inline script once, after constructing its DOM.
  // Happy DOM does not execute module scripts automatically.
  window.document.write(await response.text());
  let pending: Promise<unknown> = Promise.resolve();
  let calls = 0;
  window.fetch = ((url: URL) => {
    calls++;
    return worker.fetch(new URL(String(url)).search);
  }) as typeof window.fetch;
  const form = window.document.querySelector("form")!;
  const addEventListener = form.addEventListener.bind(form);
  // Await the actual async submit listener, including response body consumption.
  form.addEventListener = ((type, listener, options) => {
    if (type === "submit" && typeof listener === "function") {
      addEventListener(type, (event) => {
        pending = Promise.resolve(listener.call(form, event));
      }, options);
    } else {
      addEventListener(type, listener, options);
    }
  }) as typeof form.addEventListener;
  window.eval(window.document.querySelector("script")!.textContent);
  return {
    window,
    async submit(value: string) {
      window.document.querySelector("input")!.value = value;
      window.document.querySelector("form")!.dispatchEvent(new window.Event("submit", { cancelable: true }));
      await pending;
    },
    calls: () => calls,
  };
}

test("home and index.html serve the lookup form without upstream calls", async () => {
  upstreamCalls = 0;
  for (const path of ["", "index.html"]) {
    const response = await worker.fetch(path);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("Content-Type")!, /text\/html/);
    const html = await response.text();
    assert.match(html, /<label for="address">/);
    assert.match(html, /name="q"/);
    assert.match(html, /required/);
  }
  assert.equal(upstreamCalls, 0);
});

test("lookup form gets a calendar and provides an encoded, working download URL", async () => {
  failLookup = false;
  const page = await openPage();
  try {
    await page.submit("  Rådhustorget 2A & Sandvika  ");
    const document = page.window.document;
    assert.equal(document.querySelector("#result")!.hidden, false);
    const link = document.querySelector("#calendar")!;
    assert.equal(link.download, "tommekalender.ics");
    assert.equal(new URL(link.href).searchParams.get("q"), "Rådhustorget 2A & Sandvika");
    const calendarResponse = await worker.fetch(new URL(link.href).search);
    assert.equal(calendarResponse.status, 200);
    assert.match(await calendarResponse.text(), /SUMMARY:Restavfall/);
    assert.equal(document.querySelector("button")!.disabled, false);
    assert.match(document.querySelector("#status")!.textContent, /er klar/);
  } finally { await page.window.happyDOM.close(); }
});

test("failed lookup clears an earlier download and shows the upstream error", async () => {
  failLookup = false;
  const page = await openPage();
  try {
    await page.submit("Rådhustorget 2A & Sandvika");
    failLookup = true;
    await page.submit("Rådhustorget 2A & Sandvika");
    const document = page.window.document;
    assert.equal(document.querySelector("#result")!.hidden, true);
    assert.equal(document.querySelector("#calendar")!.hasAttribute("href"), false);
    assert.match(document.querySelector("#status")!.textContent, /HTTP 503/);
    assert.equal(document.querySelector("button")!.disabled, false);
  } finally { failLookup = false; await page.window.happyDOM.close(); }
});

test("blank lookup makes no request and prompts for an address", async () => {
  const page = await openPage();
  try {
    await page.submit("   ");
    assert.equal(page.calls(), 0);
    assert.match(page.window.document.querySelector("#status")!.textContent, /Skriv inn en adresse/);
    assert.equal(page.window.document.activeElement!.id, "address");
  } finally { await page.window.happyDOM.close(); }
});

test("network failure offers retry and restores the submit button", async () => {
  const page = await openPage();
  try {
    page.window.fetch = async () => { throw new Error("Network failure"); };
    await page.submit("Rådhustorget 2A & Sandvika");
    assert.match(page.window.document.querySelector("#status")!.textContent, /Prøv igjen/);
    assert.equal(page.window.document.querySelector("button")!.disabled, false);
    assert.equal(page.window.document.querySelector("#result")!.hidden, true);
  } finally { await page.window.happyDOM.close(); }
});
