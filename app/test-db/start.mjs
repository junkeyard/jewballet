// 로컬 테스트 DB 스택을 띄운다. 실제 Supabase에는 접속하지 않는다.
//
//   node test-db/start.mjs          → 띄우고 Ctrl+C까지 유지 (Playwright webServer가 이걸 부른다)
//   node test-db/start.mjs --seed   → 띄운 뒤 test-db/seed.sql(가짜 데모 데이터)까지 넣는다
//
// 구성: Postgres 16 (임시 폴더, 매번 새로 만든다) + PostgREST + 작은 프록시.
// 프록시는 supabase-js가 붙이는 /rest/v1 접두사를 떼고, 테스트가 "네트워크 끊김"을
// 흉내 낼 수 있게 /__fault 제어 엔드포인트를 둔다.
//
// 필요한 것: Postgres 서버 바이너리(initdb·postgres·psql). 없으면 PG_BIN으로 위치를 알려 준다.
// PostgREST는 PATH에 없으면 .testdb/bin에 한 번 내려받는다(linux x64만).

import { spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  JWT_SECRET,
  PG_PORT,
  PGRST_PORT,
  PROXY_PORT,
} from "./config.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(HERE, "..");
const REPO_ROOT = path.resolve(APP_ROOT, "..");
const SUPABASE_DIR = path.join(REPO_ROOT, "supabase");

// 운영 DB가 거칠 순서 그대로. 002는 요금제를 지우는 SQL이라 제외한다.
export const MIGRATIONS = [
  "001_init_schema.sql",
  "003_class_groups_monthly_attendance.sql",
  "004_fix_expiry_and_cleanup.sql",
  "005_admin_attendance_rpc.sql",
  "006_checkin_idempotency.sql",
];

const POSTGREST_VERSION = "v12.2.3";
const IS_ROOT = typeof process.getuid === "function" && process.getuid() === 0;
const DATA_DIR = path.join(os.tmpdir(), `jewballet-testdb-${PG_PORT}`);

const children = [];

function log(message) {
  console.log(`[test-db] ${message}`);
}

function findPgBin() {
  if (process.env.PG_BIN) return process.env.PG_BIN;
  const root = "/usr/lib/postgresql";
  if (existsSync(root)) {
    const versions = readdirSync(root)
      .filter((v) => existsSync(path.join(root, v, "bin", "initdb")))
      .sort((a, b) => Number(b) - Number(a));
    if (versions.length) return path.join(root, versions[0], "bin");
  }
  const which = spawnSync("sh", ["-c", "command -v initdb"], { encoding: "utf8" });
  if (which.status === 0) return path.dirname(which.stdout.trim());
  throw new Error(
    "Postgres 서버 바이너리(initdb)를 찾지 못했다. Postgres 16을 설치하거나 PG_BIN을 지정할 것.",
  );
}

async function findPostgrest() {
  if (process.env.POSTGREST_BIN) return process.env.POSTGREST_BIN;
  const which = spawnSync("sh", ["-c", "command -v postgrest"], { encoding: "utf8" });
  if (which.status === 0) return which.stdout.trim();

  const binDir = path.join(APP_ROOT, ".testdb", "bin");
  const bin = path.join(binDir, "postgrest");
  if (existsSync(bin)) return bin;

  if (process.platform !== "linux" || process.arch !== "x64") {
    throw new Error("PostgREST를 PATH에 두거나 POSTGREST_BIN을 지정할 것 (자동 설치는 linux x64만).");
  }

  mkdirSync(binDir, { recursive: true });
  const url = `https://github.com/PostgREST/postgrest/releases/download/${POSTGREST_VERSION}/postgrest-${POSTGREST_VERSION}-linux-static-x64.tar.xz`;
  log(`PostgREST ${POSTGREST_VERSION} 내려받는 중…`);
  const archive = path.join(binDir, "postgrest.tar.xz");
  run("curl", ["-fsSL", "-o", archive, url]);
  run("tar", ["-xJf", archive, "-C", binDir]);
  rmSync(archive);
  chmodSync(bin, 0o755);
  return bin;
}

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, { stdio: "pipe", encoding: "utf8", ...options });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} 실패\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout;
}

/** Postgres는 root로 못 돈다. 클라우드 컨테이너처럼 root일 때는 postgres 사용자로 내려서 실행한다. */
function asPostgres(cmd, args) {
  return IS_ROOT ? ["runuser", ["-u", "postgres", "--", cmd, ...args]] : [cmd, args];
}

function psqlFile(pgBin, file) {
  run(path.join(pgBin, "psql"), [
    "-h", "127.0.0.1",
    "-p", String(PG_PORT),
    "-U", "postgres",
    "-d", "postgres",
    "-v", "ON_ERROR_STOP=1",
    "-q",
    "-f", file,
  ]);
}

async function waitFor(check, label, timeoutMs = 20_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`${label} 대기 시간 초과`);
}

function httpOk(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode !== undefined && res.statusCode < 500);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function startProcess(label, cmd, args, env) {
  const child = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: "pipe" });
  child.stdout.on("data", (d) => process.env.TESTDB_VERBOSE && process.stdout.write(`[${label}] ${d}`));
  child.stderr.on("data", (d) => process.env.TESTDB_VERBOSE && process.stderr.write(`[${label}] ${d}`));
  child.on("exit", (code) => {
    if (!shuttingDown) {
      console.error(`[test-db] ${label}가 예기치 않게 종료됨 (code ${code})`);
      shutdown(1);
    }
  });
  children.push(child);
  return child;
}

// ── 프록시: /rest/v1 → PostgREST, /__fault로 장애 주입 ─────────────────────────

const fault = { down: false, pathIncludes: "" };

function startProxy() {
  const server = http.createServer((req, res) => {
    const url = req.url ?? "/";

    if (url === "/__health") {
      res.writeHead(200).end("ok");
      return;
    }

    if (url === "/__fault") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        const next = body ? JSON.parse(body) : {};
        fault.down = Boolean(next.down);
        fault.pathIncludes = String(next.pathIncludes ?? "");
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(fault));
      });
      return;
    }

    if (fault.down && url.includes(fault.pathIncludes)) {
      // 응답 없이 연결을 끊는다 — fetch 입장에서는 네트워크 오류다.
      req.socket.destroy();
      return;
    }

    const target = url.startsWith("/rest/v1") ? url.slice("/rest/v1".length) || "/" : url;
    const upstream = http.request(
      {
        host: "127.0.0.1",
        port: PGRST_PORT,
        method: req.method,
        path: target,
        headers: { ...req.headers, host: `127.0.0.1:${PGRST_PORT}` },
      },
      (upRes) => {
        res.writeHead(upRes.statusCode ?? 502, upRes.headers);
        upRes.pipe(res);
      },
    );
    upstream.on("error", () => {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
    req.pipe(upstream);
  });

  return new Promise((resolve) => server.listen(PROXY_PORT, "127.0.0.1", () => resolve(server)));
}

// ── 종료 처리 ─────────────────────────────────────────────────────────────────

let shuttingDown = false;
let proxyServer = null;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  proxyServer?.close();
  for (const child of children.reverse()) child.kill("SIGINT");
  setTimeout(() => {
    rmSync(DATA_DIR, { recursive: true, force: true });
    process.exit(code);
  }, 500);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

// ── 본체 ──────────────────────────────────────────────────────────────────────

async function main() {
  const pgBin = findPgBin();
  const postgrest = await findPostgrest();

  rmSync(DATA_DIR, { recursive: true, force: true });
  mkdirSync(DATA_DIR, { recursive: true });
  if (IS_ROOT) run("chown", ["-R", "postgres:postgres", DATA_DIR]);

  log(`Postgres 초기화 (${pgBin})`);
  const [initCmd, initArgs] = asPostgres(path.join(pgBin, "initdb"), [
    "-D", DATA_DIR,
    "-U", "postgres",
    "--auth=trust",
    "--no-locale",
    "-E", "UTF8",
  ]);
  run(initCmd, initArgs);

  // Supabase처럼 서버 시간대는 UTC로 둔다 — KST 처리가 코드에서 제대로 되는지 드러나게.
  const [pgCmd, pgArgs] = asPostgres(path.join(pgBin, "postgres"), [
    "-D", DATA_DIR,
    "-p", String(PG_PORT),
    "-k", DATA_DIR,
    "-c", "listen_addresses=127.0.0.1",
    "-c", "timezone=UTC",
    "-c", "fsync=off",
    "-c", "synchronous_commit=off",
    "-c", "full_page_writes=off",
  ]);
  startProcess("postgres", pgCmd, pgArgs);

  await waitFor(
    () =>
      spawnSync(path.join(pgBin, "pg_isready"), ["-h", "127.0.0.1", "-p", String(PG_PORT)])
        .status === 0,
    "Postgres",
  );

  psqlFile(pgBin, path.join(HERE, "bootstrap.sql"));
  for (const file of MIGRATIONS) {
    psqlFile(pgBin, path.join(SUPABASE_DIR, file));
    log(`적용: ${file}`);
  }

  // 001이 넣는 예시 요금제·반은 테스트가 매번 지우고 새로 넣는다. 데모용 가짜 데이터는 --seed로.
  if (process.argv.includes("--seed")) {
    psqlFile(pgBin, path.join(HERE, "seed.sql"));
    log("가짜 시드 적용: test-db/seed.sql");
  }

  startProcess("postgrest", postgrest, [], {
    PGRST_DB_URI: `postgres://authenticator@127.0.0.1:${PG_PORT}/postgres`,
    PGRST_DB_SCHEMAS: "public",
    PGRST_DB_ANON_ROLE: "anon",
    PGRST_JWT_SECRET: JWT_SECRET,
    PGRST_SERVER_HOST: "127.0.0.1",
    PGRST_SERVER_PORT: String(PGRST_PORT),
    PGRST_LOG_LEVEL: "error",
  });
  await waitFor(() => httpOk(`http://127.0.0.1:${PGRST_PORT}/`), "PostgREST");

  proxyServer = await startProxy();
  log(`준비 완료 — NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:${PROXY_PORT}`);
}

main().catch((error) => {
  console.error(`[test-db] ${error.message}`);
  shutdown(1);
});
