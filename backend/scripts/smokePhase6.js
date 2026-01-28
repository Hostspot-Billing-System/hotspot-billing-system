import app from '../src/app.js';
import '../src/config/env.js';
import { checkDbConnection } from '../src/config/db.js';

async function requestJson(url) {
  const res = await fetch(url);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

async function main() {
  await checkDbConnection();

  const server = await new Promise((resolve, reject) => {
    const s = app.listen(0, () => resolve(s));
    s.on('error', reject);
  });

  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  const results = {};
  results.voucherBatches = await requestJson(`${base}/api/voucher-batches?limit=2&page=1`);
  results.vouchers = await requestJson(`${base}/api/vouchers?limit=2&page=1`);

  const firstBatchId = results.voucherBatches.json?.data?.[0]?.id;
  if (firstBatchId) {
    results.batchVouchers = await requestJson(
      `${base}/api/voucher-batches/${firstBatchId}/vouchers?limit=2&page=1`
    );
  }

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(results, null, 2));

  await new Promise((resolve) => server.close(resolve));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Phase 6 smoke failed:', err?.message ?? err);
  process.exit(1);
});
