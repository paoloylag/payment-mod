import { execFileSync } from "node:child_process";

export default async function globalTeardown() {
  try { execFileSync("docker", ["rm", "-f", "payment-module-e2e-api"], { stdio: "ignore" }); } catch {}
}
