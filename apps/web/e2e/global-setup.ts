import { execFileSync } from "node:child_process";
import path from "node:path";

export default function globalSetup() {
  const root = path.resolve(import.meta.dirname, "../../..");
  const api = path.join(root, "apps/api");
  const databaseUrl =
    "postgresql+psycopg://koranco_dev:koranco_dev@localhost:5432/koranco_e2e";
  const existing = execFileSync(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "db",
      "psql",
      "-U",
      "koranco_dev",
      "-d",
      "postgres",
      "-Atc",
      "SELECT 1 FROM pg_database WHERE datname='koranco_e2e'",
    ],
    { cwd: root, encoding: "utf8" },
  ).trim();
  if (existing !== "1") {
    execFileSync(
      "docker",
      [
        "compose",
        "exec",
        "-T",
        "db",
        "createdb",
        "-U",
        "koranco_dev",
        "koranco_e2e",
      ],
      { cwd: root, stdio: "inherit" },
    );
  }
  const env = {
    ...process.env,
    KORANCO_ENVIRONMENT: "test",
    KORANCO_DATABASE_URL: databaseUrl,
    PYTHONPATH: "src",
    UV_CACHE_DIR: "/private/tmp/koranco-uv-cache",
  };
  execFileSync("uv", ["run", "alembic", "upgrade", "head"], {
    cwd: api,
    env,
    stdio: "inherit",
  });
  execFileSync("uv", ["run", "python", "tests/e2e_seed.py"], {
    cwd: api,
    env,
    stdio: "inherit",
  });
}
