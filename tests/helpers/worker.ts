import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

// Bundle the real entry point and use workerd, including its HTMLRewriter.
// Only outbound HTTP is substituted; no application modules are mocked.
export async function createWorker(outboundService: (request: Request) => Promise<Response>) {
  const directory = await mkdtemp(join(tmpdir(), "dunk-i-tide-test-"));
  let worker: Miniflare | undefined;
  try {
    const root = fileURLToPath(new URL("../../", import.meta.url));
    const build = spawnSync(process.execPath, [
      join(root, "node_modules/wrangler/bin/wrangler.js"),
      "deploy", "--dry-run", "--outdir", directory,
    ], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        WRANGLER_SEND_METRICS: "false",
        XDG_CONFIG_HOME: join(directory, "config"),
        WRANGLER_LOG_PATH: join(directory, "wrangler.log"),
      },
      timeout: 60_000,
    });
    assert.equal(build.status, 0, `Worker build failed: ${build.error ?? ""}\n${build.stdout}\n${build.stderr}`);
    worker = new Miniflare(convertV4MiniflareOptions({
      rootPath: directory,
      modulesRoot: directory,
      modules: [
        { type: "ESModule", path: join(directory, "index.js") },
        ...(await readdir(directory)).filter((name) => name.endsWith(".html"))
          .map((name) => ({ type: "Text" as const, path: join(directory, name) })),
      ],
      compatibilityDate: "2026-08-01",
      compatibilityFlags: ["nodejs_compat"],
      outboundService,
    }));
    await worker.ready;
    return {
      fetch: (query: string) => worker!.dispatchFetch(`https://calendar.example/${query}`),
      async dispose() {
        await worker!.dispose();
        await rm(directory, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await worker?.dispose();
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
