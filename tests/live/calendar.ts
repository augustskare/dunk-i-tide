import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createWorker } from "../helpers/worker.ts";

let worker: Awaited<ReturnType<typeof createWorker>>;
before(async () => {
  // Node's --use-env-proxy routes workerd's outbound requests through the
  // cloud environment's supported HTTPS proxy without changing the Worker.
  worker = await createWorker(async (request) => {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.method === "GET" || request.method === "HEAD"
        ? undefined : await request.arrayBuffer(),
      signal: AbortSignal.timeout(30_000),
    });
    return new Response(await response.arrayBuffer(), {
      status: response.status,
      headers: response.headers,
    });
  });
});
after(async () => { await worker?.dispose(); });

function verifyCalendar(calendar: string) {
  assert.match(calendar, /BEGIN:VCALENDAR/);
  assert.match(calendar, /BEGIN:VEVENT/);
  assert.match(calendar, /DTSTART;VALUE=DATE:\d{8}/);
  assert.match(calendar, /SUMMARY:.+/);
  const ids = [...calendar.matchAll(/^UID:(.+)$/gm)].map((match) => match[1]);
  assert.ok(ids.length > 0);
  assert.equal(new Set(ids).size, ids.length, "collection events must have unique UIDs");
  return ids.length;
}

for (const address of ["Rådhustorget 2 Sandvika", "Åsmarkvegen 111 Lillehammer", "Storgata 94B Tromsø", "Tennvasslia 10 Hansnes"]) {
  test(`live address lookup and calendar: ${address}`, { timeout: 90_000 }, async () => {
    const response = await worker.fetch("?q=" + encodeURIComponent(address));
    const calendar = await response.text();
    assert.equal(response.status, 200, `${address}: ${calendar}`);
    console.log(`${address}: ${verifyCalendar(calendar)} collection events`);
  });
}

test("live address without collection dates returns an explicit error", { timeout: 90_000 }, async () => {
  const response = await worker.fetch("?q=" + encodeURIComponent("Storgata 1 Tromsø"));
  assert.equal(response.status, 400);
  assert.equal(await response.text(), "No collection dates found for this address in Min Renovasjon");
});
