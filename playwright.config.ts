import { defineConfig } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';

const tempDb = path.join(os.tmpdir(), `depotpro_e2e_${Date.now()}.db`);

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:3100',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    // The single business backend is the Axum server, serving the built SPA + /api.
    // We build dist first, then run Axum which serves ./dist with SPA fallback.
    command: 'npm run build && cargo run -p depotpro-server',
    url: 'http://127.0.0.1:3100/api/health',
    reuseExistingServer: false,
    timeout: 240_000,
    env: {
      PORT: '3100',
      HOST: '127.0.0.1',
      DEPOTPRO_DB_PATH: tempDb,
    },
  },
});
