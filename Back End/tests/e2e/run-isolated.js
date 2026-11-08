import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Each Playwright invocation runs global setup against payment_module_e2e.
// Activated Finance policies are immutable and must not leak between specifications.
const directory = fileURLToPath(new URL("./", import.meta.url));
const root = fileURLToPath(new URL("../../", import.meta.url));
const cli = fileURLToPath(new URL("../../node_modules/@playwright/test/cli.js", import.meta.url));
const files = readdirSync(directory).filter(name => name.endsWith(".spec.js")).sort();
const arguments_ = process.argv.slice(2);
const requested = arguments_.filter(value => value.endsWith(".spec.js"));
const options = arguments_.filter(value => !value.endsWith(".spec.js"));
const selected = requested.length ? files.filter(file => requested.some(value => value.replaceAll("\\", "/").split("/").at(-1) === file)) : files;
if (requested.length && selected.length !== new Set(requested.map(value => value.replaceAll("\\", "/").split("/").at(-1))).size) {
  throw new Error("Choose existing browser specifications under tests/e2e");
}
const failed = [];
for (const file of selected) {
  const result = spawnSync(process.execPath, [cli, "test", `tests/e2e/${file}`, ...options], { cwd: root, stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    failed.push(file);
    if (process.env.PAYMENT_E2E_CONTINUE_ON_FAILURE !== "true") process.exit(result.status ?? 1);
  }
}
if (failed.length) { console.error(`Failed ${failed.length}/${selected.length} specifications: ${failed.join(", ")}`); process.exit(1); }
console.log(`All ${selected.length} isolated browser specifications passed.`);
