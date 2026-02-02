import app from "./src/app.js";
import "./src/config/env.js";
import { env } from "./src/config/env.js";
import { checkDbConnection } from "./src/config/db.js";
import { startMikroTikExpiryCron } from './src/services/mikrotikExpiryService.js';
import { getRuntimeHealth } from './src/services/mikrotikRuntimeService.js';

if (env.MIKROTIK_MOCK) {
  console.warn('[MIKROTIK_MOCK] Enabled: backend will NOT connect to the real router.');
}

async function start() {
  try {
    await checkDbConnection();
    console.log('Database connection: ok');
  } catch (err) {
    console.warn('Database connection: failed. Backend will start in degraded mode.');
    console.warn(err?.message ?? err);
  }

  // MikroTik runtime connectivity (router is source of truth for access control).
  try {
    const status = await getRuntimeHealth();
    console.log(`MikroTik connection: ok${status?.identity ? ` (identity: ${status.identity})` : ''}`);
  } catch (err) {
    const code = err?.code ?? 'MIKROTIK_OFFLINE';
    console.warn(`MikroTik connection: failed (${code}). Runtime endpoints may be unavailable.`);
  }

  app.listen(env.PORT, () => {
    console.log(`Backend running on port ${env.PORT}`);
    startMikroTikExpiryCron();
  });
}

start().catch((err) => {
  console.error('Backend failed to start:', err);
  process.exit(1);
});
