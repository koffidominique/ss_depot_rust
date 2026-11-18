// DEPOTPRO dev orchestrator.
//
// Runs the two dev processes together:
//   1. depotpro-server (Axum) — the SINGLE business backend on 127.0.0.1:3000
//   2. vite — the SPA dev server on :5173, proxying /api to Axum
//
// This replaces the former Node/Express dev host (server.ts). No Node business
// server is started. Node is used here only as a lightweight process supervisor
// (allowed: the ban concerns the Node *business* server, not tooling).
//
// Cross-platform: uses only Node built-ins; resolves the local Vite binary via
// its JS entrypoint so no shell is required.

import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const isWin = process.platform === 'win32';
const children = [];
let shuttingDown = false;

function label(name) {
  return `[${name}]`;
}

function pipe(stream, name) {
  let buf = '';
  stream.on('data', (chunk) => {
    buf += chunk.toString();
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      process.stdout.write(`${label(name)} ${line}\n`);
    }
  });
}

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) {
      try {
        child.kill(isWin ? undefined : 'SIGTERM');
      } catch {
        /* ignore */
      }
    }
  }
  process.exit(code ?? 0);
}

function run(name, cmd, args) {
  const child = spawn(cmd, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: isWin, // resolve .cmd shims (cargo/vite) on Windows
    env: process.env,
  });
  children.push(child);
  pipe(child.stdout, name);
  pipe(child.stderr, name);
  child.on('exit', (code) => {
    if (!shuttingDown) {
      console.error(`${label(name)} exited with code ${code}; stopping dev`);
      shutdown(code ?? 1);
    }
  });
  child.on('error', (err) => {
    console.error(`${label(name)} failed to start:`, err);
    shutdown(1);
  });
  return child;
}

// 1) Axum business API (single backend). PORT/HOST/DEPOTPRO_DB_PATH overridable.
run('api', 'cargo', ['run', '-p', 'depotpro-server']);

// 2) Vite SPA dev server (proxies /api -> Axum).
const viteBin = path.resolve(process.cwd(), 'node_modules/vite/bin/vite.js');
run('web', process.execPath, [viteBin]);

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => shutdown(0));
}