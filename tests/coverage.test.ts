import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { Window } from "happy-dom";
import { createWorker } from "./helpers/worker.ts";

let worker: Awaited<ReturnType<typeof createWorker>>;
before(async () => {
  worker = await createWorker(async () => { throw new Error("Coverage pages must not call upstream APIs"); });
});
after(async () => { await worker?.dispose(); });

test("coverage report accounts for every municipality and separates registry membership from verified calendars", async () => {
  const response = await worker.fetch("coverage.json");
  assert.equal(response.status, 200);
  const report = await response.json() as {
    checkedAt: string;
    counts: Record<string, number>;
    municipalities: { number: string; listed: boolean; status: string; sampleAddress?: string; events?: number }[];
  };
  assert.ok(Number.isFinite(Date.parse(report.checkedAt)));
  assert.ok(report.municipalities.length > 300);
  assert.equal(report.counts["not-checked"] ?? 0, 0, "Published report must finish checking registered municipalities");
  assert.equal(new Set(report.municipalities.map((item) => item.number)).size, report.municipalities.length);
  assert.equal(Object.values(report.counts).reduce((sum, value) => sum + value, 0), report.municipalities.length);
  for (const [status, count] of Object.entries(report.counts)) {
    assert.equal(report.municipalities.filter((item) => item.status === status).length, count);
  }
  for (const item of report.municipalities) {
    if (item.status === "verified") {
      assert.equal(item.listed, true);
      assert.ok(item.sampleAddress && item.events && item.events > 0);
    }
    if (!item.listed) assert.equal(item.status, "not-listed");
  }
});

test("coverage page renders actual results and filters municipalities without presenting registry entries as verified", async () => {
  const response = await worker.fetch("coverage");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("Content-Type")!, /text\/html/);
  const window = new Window({
    url: "https://calendar.example/coverage",
    settings: { enableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, suppressInsecureJavaScriptEnvironmentWarning: true },
  });
  try {
    window.document.write((await response.text()).replace('type="module"', 'type="application/x-test"'));
    const reportResponse = await worker.fetch("coverage.json");
    const reportText = await reportResponse.text();
    const report = JSON.parse(reportText);
    window.fetch = (async () => new Response(reportText)) as typeof window.fetch;
    await window.eval(window.document.querySelector("script")!.textContent);
    const document = window.document;
    const rows = () => [...document.querySelectorAll("tbody tr")];
    assert.equal(rows().length, report.municipalities.length);
    assert.match(document.querySelector("#summary")!.textContent, /verifisert eksempelkalender/);
    const filter = document.querySelector("select")!;
    filter.value = "verified";
    filter.dispatchEvent(new window.Event("change"));
    assert.equal(rows().length, report.counts.verified);
    for (const row of rows()) {
      const link = row.querySelector("a")!;
      assert.ok(new URL(link.href).searchParams.get("q"));
    }
    filter.value = "unverified";
    filter.dispatchEvent(new window.Event("change"));
    assert.equal(rows().length, report.municipalities.filter((item) => item.listed && item.status !== "verified").length);
    filter.value = "not-listed";
    filter.dispatchEvent(new window.Event("change"));
    assert.equal(rows().length, report.counts["not-listed"]);
    assert.ok(rows().every((row) => !row.querySelector("a")));
    filter.value = "all";
    filter.dispatchEvent(new window.Event("change"));
    const search = document.querySelector("input")!;
    search.value = "5501";
    search.dispatchEvent(new window.Event("input"));
    assert.equal(rows().length, 1);
    assert.match(rows()[0].textContent, /Tromsø/);
  } finally { await window.happyDOM.close(); }
});
