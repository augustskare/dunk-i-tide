import assert from "node:assert/strict";
import { readFile, rename, writeFile } from "node:fs/promises";
import { createWorker } from "../tests/helpers/worker.ts";

const municipalityUrl = "https://ws.geonorge.no/kommuneinfo/v1/kommuner";
const registryUrl = "https://norkartrenovasjon.azurewebsites.net/proxyserver.ashx?server=https://www.webatlas.no/wacloud/servicerepository/CatalogueService.svc/json/GetRegisteredAppCustomers?Appid=MobilOS-NorkartRenovasjon";
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function request(url: string, init?: RequestInit) {
  return fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
}
async function calendarRequest(query: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    // Keep pacing and backoff outside the Worker's 20-second upstream timeout.
    await delay(attempt === 0 ? 2000 : 35_000);
    const response = await worker.fetch("?q=" + encodeURIComponent(query));
    const calendar = await response.text();
    if (!calendar.includes("HTTP 429") || attempt === 1) return { response, calendar };
    console.log("Norkart throttled an address check; waiting 35s before one retry");
  }
  throw new Error("Calendar retries exhausted");
}
async function json(url: string) {
  const response = await request(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}
const [municipalities, customers] = await Promise.all([json(municipalityUrl), json(registryUrl)]);
assert.ok(Array.isArray(municipalities) && municipalities.length > 300, "Invalid municipality list");
assert.ok(Array.isArray(customers) && customers.length > 0, "Invalid Norkart registry");
const registered = new Set(customers.map((item: { Number: string }) => item.Number.padStart(4, "0")));
const today = new Date().toISOString().slice(0, 10).replaceAll("-", "");
type Result = { number: string; name: string; listed: boolean; status: string; attempts: { address: string; error?: string }[]; sampleAddress?: string; events?: number };
const sampleSize = Number(process.env.COVERAGE_SAMPLE_SIZE ?? "3");
assert.ok(Number.isInteger(sampleSize) && sampleSize >= 1 && sampleSize <= 10);
const reportUrl = new URL("../docs/coverage.json", import.meta.url);
const only = process.argv.find((argument) => argument.startsWith("--only="))?.slice(7).split(",");
assert.ok(!only || process.argv.includes("--resume"), "--only requires --resume to retain other results");
const knownSamples: Record<string, string> = {
  "3201": "Rådhustorget 2 Sandvika",
  "3405": "Åsmarkvegen 111 Lillehammer",
  "5501": "Storgata 94B Tromsø",
  "5534": "Tennvasslia 10 Hansnes",
};
const previous = process.argv.includes("--resume") ? JSON.parse(await readFile(reportUrl, "utf8")) : { municipalities: [] };
assert.ok(!only || previous.checkedAt?.slice(0, 10) === new Date().toISOString().slice(0, 10), "Targeted retries require a report from today; run a full audit to refresh older results");
assert.ok(!only || only.every((number) => municipalities.some((item: { kommunenummer: string }) => item.kommunenummer === number)), "Unknown municipality in --only");
const results: Result[] = municipalities.map((item: { kommunenummer: string; kommunenavnNorsk: string }) => {
  const old = previous.municipalities.find((entry: Result) => entry.number === item.kommunenummer && registered.has(item.kommunenummer) && (entry.status === "verified" || only) && previous.checkedAt?.slice(0, 10) === new Date().toISOString().slice(0, 10));
  return old ?? { number: item.kommunenummer, name: item.kommunenavnNorsk, listed: registered.has(item.kommunenummer), status: registered.has(item.kommunenummer) ? "not-checked" : "not-listed", attempts: [] };
});
async function save() {
  const counts = Object.fromEntries([...new Set(results.map((item) => item.status))].map((status) => [status, results.filter((item) => item.status === status).length]));
  const temporary = new URL("../docs/coverage.json.tmp", import.meta.url);
  await writeFile(temporary, JSON.stringify({ checkedAt: new Date().toISOString(), sources: { municipalities: municipalityUrl, norkartRegistry: registryUrl }, sampleSize, method: `Up to ${sampleSize} addresses per registered municipality (known live-test addresses first, then Geonorge samples), through the bundled Worker in workerd. Verified means a named calendar with unique municipality-specific UIDs and at least one current or future collection date. A sample does not prove every address works. Registry absence is not proof of no Norkart data.`, counts, municipalities: [...results].sort((a, b) => a.number.localeCompare(b.number)) }, null, 2) + "\n");
  await rename(temporary, reportUrl);
  return counts;
}
await save();
const worker = await createWorker(async (req) => {
  const response = await request(req.url, { method: req.method, headers: req.headers });
  return new Response(await response.arrayBuffer(), { status: response.status, headers: response.headers });
});

let next = 0;
let completed = 0;
async function audit() {
  while (next < municipalities.length) {
    const index = next++;
    const municipality = municipalities[index];
    if (only ? !only.includes(municipality.kommunenummer) : results[index].status === "verified") continue;
    const result: Result = { number: municipality.kommunenummer, name: municipality.kommunenavnNorsk, listed: registered.has(municipality.kommunenummer), status: "not-listed", attempts: [] };
    if (result.listed) {
      try {
        const url = new URL("https://ws.geonorge.no/adresser/v1/sok");
        url.search = new URLSearchParams({ kommunenummer: result.number, treffPerSide: String(sampleSize), utkoordsys: "4258" }).toString();
        const data = await json(url.href);
        result.status = "no-address";
        const addresses = [knownSamples[result.number], ...data.adresser.map((address: { adressetekst: string; postnummer: string; poststed: string }) => `${address.adressetekst}, ${address.postnummer} ${address.poststed}`)]
          .filter((address): address is string => Boolean(address)).slice(0, sampleSize);
        for (const query of addresses) {
          const attempt: Result["attempts"][number] = { address: query };
          result.attempts.push(attempt);
          const { response, calendar } = await calendarRequest(query);
          if (response.status !== 200) {
            attempt.error = calendar.slice(0, 500);
            result.status = calendar.includes("HTTP 429") ? "rate-limited" : calendar.includes("No collection dates") ? "no-dates-in-sample" : "request-failed";
            if (result.status !== "no-dates-in-sample") break;
            continue;
          }
          try {
            assert.match(calendar, /BEGIN:VCALENDAR/);
            const ids = [...calendar.matchAll(/^UID:(.+)\r?$/gm)].map((match) => match[1].trim());
            assert.ok(ids.length > 0 && ids.every((id) => id.startsWith(result.number + "-")), "Wrong municipality or no events");
            assert.equal(new Set(ids).size, ids.length, "Duplicate event UIDs");
            const dates = [...calendar.matchAll(/^DTSTART;VALUE=DATE:(\d{8})/gm)].map((match) => match[1]);
            assert.equal(dates.length, ids.length, "Missing collection dates");
            assert.ok(dates.some((date) => date >= today), "No current or future collection dates");
            assert.equal([...calendar.matchAll(/^SUMMARY:.+/gm)].length, ids.length, "Missing event names");
            result.status = "verified";
            result.sampleAddress = query;
            result.events = ids.length;
            break;
          } catch (error) {
            attempt.error = String(error).slice(0, 500);
            result.status = "invalid-calendar";
          }
        }
      } catch (error) {
        result.status = "request-failed";
        result.attempts.push({ address: "", error: String(error).slice(0, 500) });
      }
    }
    results[index] = result;
    await save();
    completed++;
    if (completed % 10 === 0 || result.listed) console.log(`${completed}/${municipalities.length}: ${result.name}: ${result.status}${result.status === "request-failed" ? " " + result.attempts.at(-1)?.error?.slice(0, 100) : ""}`);
  }
}
try {
  await audit();
} finally {
  await worker.dispose();
}
console.log(JSON.stringify(await save(), null, 2));
