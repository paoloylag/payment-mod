import { execFileSync } from "node:child_process";

const compose = (...args) => execFileSync("docker", ["compose", ...args], { stdio: "inherit" });

export default async function globalSetup() {
  compose("up", "-d", "db", "minio", "minio-init");
  compose("build", "app");
  compose("exec", "-T", "db", "psql", "-U", "payment_module", "-d", "postgres", "-c",
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'payment_module_e2e';");
  compose("exec", "-T", "db", "dropdb", "-U", "payment_module", "--if-exists", "payment_module_e2e");
  compose("exec", "-T", "db", "createdb", "-U", "payment_module", "payment_module_e2e");
  try { execFileSync("docker", ["rm", "-f", "payment-module-e2e-api"], { stdio: "ignore" }); } catch {}
  compose(
    "run", "-d", "--name", "payment-module-e2e-api", "--no-deps",
    "-p", "127.0.0.1:58003:8002",
    "-e", "APP_ENV=test",
    "-e", "DATABASE_URL=postgresql+psycopg://payment_module:payment_module@db:5432/payment_module_e2e",
    "-e", "CORS_ORIGINS=http://127.0.0.1:5178",
    "-e", "DEVELOPMENT_DEMO_PASSWORD=Phase01-Test-Only!",
    "app",
  );
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch("http://127.0.0.1:58003/readyz");
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("The dedicated browser-test API did not become ready.");
}
