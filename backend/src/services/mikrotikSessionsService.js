import { query } from '../config/db.js';
import { listHotspotActive } from './mikrotikRuntime/runtimeService.js';

function mapActiveSession(row) {
  return {
    user: row?.user ?? null,
    ip: row?.address ?? null,
    mac: row?.mac_address ?? null,
    uptime: row?.uptime ?? null,
    bytes_in: Number(row?.bytes_in ?? 0),
    bytes_out: Number(row?.bytes_out ?? 0),
  };
}

function uniqueNonEmptyStrings(values) {
  const out = [];
  const seen = new Set();
  for (const v of values) {
    const s = String(v ?? '').trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

export async function getMikroTikActiveSessions({ dbQuery = query, listActive = listHotspotActive } = {}) {
  const active = await listActive({});
  const mapped = (active ?? []).map(mapActiveSession);

  const users = uniqueNonEmptyStrings(mapped.map((s) => s.user));
  if (users.length === 0) {
    return mapped.map((s) => ({ ...s, package_name: null }));
  }

  const res = await dbQuery(
    `
    SELECT
      v.code,
      p.name AS package_name
    FROM vouchers v
    JOIN packages p ON p.id = v.package_id
    WHERE v.code = ANY($1)
    `,
    [users]
  );

  const packageByCode = new Map();
  for (const row of res.rows ?? []) {
    const code = String(row.code ?? '').trim();
    if (!code) continue;
    packageByCode.set(code, row.package_name ?? null);
  }

  return mapped.map((s) => ({
    ...s,
    package_name: s.user ? (packageByCode.get(s.user) ?? null) : null,
  }));
}
