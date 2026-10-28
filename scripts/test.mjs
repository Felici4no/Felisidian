// Bundles the TypeScript tests with esbuild and runs them with node:test.
// Only pure modules (no "obsidian" import) can be tested this way.
import esbuild from "esbuild";
import { spawnSync } from "child_process";
import { mkdirSync, rmSync } from "fs";
import { resolve } from "path";

const root = resolve(import.meta.dirname, "..");
const out = resolve(root, ".test-out");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

await esbuild.build({
  entryPoints: [resolve(root, "tests/library.test.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: resolve(out, "library.test.cjs"),
  logLevel: "error",
});

const run = spawnSync(process.execPath, ["--test", resolve(out, "library.test.cjs")], {
  stdio: "inherit",
});
rmSync(out, { recursive: true, force: true });
process.exit(run.status ?? 1);
