import { query } from '../config/db.js';

function normalizeText(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : null;
}

function parsePositiveInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

function parseIdParam(req) {
  const idNum = parsePositiveInt(req.params?.id);
  return idNum;
}

function toStatus(isActive) {
  return isActive ? 'active' : 'disabled';
}

function parseStatus(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return null;
  if (raw === 'active') return 'active';
  if (raw === 'disabled') return 'disabled';
  return null;
}

async function hasPublicTableColumn({ table, column }) {
  const t = String(table ?? '').trim();
  const c = String(column ?? '').trim();
  if (!t || !c) return false;
  const res = await query(
    `
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = $1
      AND column_name = $2
    LIMIT 1
    `,
    [t, c]
  );
  return Boolean(res.rows?.[0]);
}

export async function listBundles(req, res) {
  try {
    console.info('GET /api/bundles');

    const status = parseStatus(req.query?.status);
    const includeDeletedRaw = String(req.query?.include_deleted ?? '').trim().toLowerCase();
    const includeDeleted = includeDeletedRaw === '1' || includeDeletedRaw === 'true' || includeDeletedRaw === 'yes';

    const hasPriceUgx = await hasPublicTableColumn({ table: 'packages', column: 'price_ugx' });
    const hasIsActive = await hasPublicTableColumn({ table: 'packages', column: 'is_active' });
    const hasDescription = await hasPublicTableColumn({ table: 'packages', column: 'description' });
    const hasUpdatedAt = await hasPublicTableColumn({ table: 'packages', column: 'updated_at' });
    const hasDeletedAt = await hasPublicTableColumn({ table: 'packages', column: 'deleted_at' });

    const where = [];
    const params = [];

    if (hasIsActive && status) {
      where.push(`p.is_active = $${params.length + 1}`);
      params.push(status === 'active');
    }

    if (hasDeletedAt && !includeDeleted) {
      where.push('p.deleted_at IS NULL');
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const result = await query(
      `
      SELECT
        p.id::text AS id,
        p.name,
        p.duration_minutes::int AS duration_minutes,
        p.mikrotik_profile,
        ${hasPriceUgx ? 'p.price_ugx::int AS price_ugx' : 'NULL::int AS price_ugx'},
        ${hasDescription ? 'p.description' : 'NULL::text AS description'},
        ${hasIsActive ? 'p.is_active' : 'TRUE AS is_active'},
        p.created_at,
        ${hasUpdatedAt ? 'p.updated_at' : 'p.created_at AS updated_at'},
        COALESCE(vc.total, 0)::int AS vouchers_total,
        COALESCE(vc.available, 0)::int AS vouchers_available
      FROM packages p
      LEFT JOIN (
        SELECT
          v.package_id,
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE v.status = 'available')::int AS available
        FROM vouchers v
        GROUP BY v.package_id
      ) vc ON vc.package_id = p.id
      ${whereSql}
      ORDER BY p.duration_minutes ASC, p.id ASC
      `,
      params
    );

    const rows = (result.rows ?? []).map((r) => {
      const isActive = Boolean(r?.is_active ?? true);
      return {
        id: String(r.id),
        name: r.name,
        duration_minutes: r.duration_minutes == null ? null : Number(r.duration_minutes),
        price_ugx: r.price_ugx == null ? null : Number(r.price_ugx),
        description: r.description ?? null,
        status: toStatus(isActive),
        is_active: isActive,
        mikrotik_profile: r.mikrotik_profile ?? null,
        created_at: r.created_at,
        updated_at: r.updated_at,
        vouchers_total: Number(r.vouchers_total ?? 0),
        vouchers_available: Number(r.vouchers_available ?? 0),
      };
    });

    return res.status(200).json({ success: true, data: rows });
  } catch (err) {
    console.error('[Bundles] listBundles failed', {
      code: err?.code ?? null,
      message: err?.message ?? String(err),
    });
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
}

export async function createBundle(req, res) {
  try {
    console.info('POST /api/bundles');

    const name = normalizeText(req.body?.name);
    const duration_minutes = parsePositiveInt(req.body?.duration_minutes ?? req.body?.duration);
    const price_ugx = parsePositiveInt(req.body?.price_ugx ?? req.body?.price);
    const description = normalizeText(req.body?.description);

    if (!name) {
      return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'name is required' } });
    }
    if (!duration_minutes) {
      return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'duration_minutes is required' } });
    }
    if (!price_ugx) {
      return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'price_ugx is required' } });
    }

    const hasDescription = await hasPublicTableColumn({ table: 'packages', column: 'description' });
    const hasUpdatedAt = await hasPublicTableColumn({ table: 'packages', column: 'updated_at' });
    const hasDeletedAt = await hasPublicTableColumn({ table: 'packages', column: 'deleted_at' });

    // If this DB supports soft-delete and a bundle with this name exists but was deleted,
    // restore it instead of failing on UNIQUE(name).
    if (hasDeletedAt) {
      const existing = await query(
        `
        SELECT id, deleted_at
        FROM packages
        WHERE name = $1
        LIMIT 1
        `,
        [name]
      );

      const row = existing.rows?.[0] ?? null;
      if (row?.id && row?.deleted_at) {
        const setParts = ['duration_minutes = $2', 'price_ugx = $3', 'is_active = TRUE', 'deleted_at = NULL'];
        const restoreParams = [Number(row.id), duration_minutes, price_ugx];

        if (hasDescription) {
          setParts.push(`description = $${restoreParams.length + 1}`);
          restoreParams.push(description);
        }

        if (hasUpdatedAt) {
          setParts.push('updated_at = NOW()');
        }

        const restored = await query(
          `
          UPDATE packages
          SET ${setParts.join(', ')}, mikrotik_profile = CONCAT('hotspot_', id)
          WHERE id = $1::bigint
          RETURNING id::text AS id
          `,
          restoreParams
        );

        const id = restored.rows?.[0]?.id;
        if (id) {
          return res.status(201).json({ success: true, id: String(id) });
        }
      }
    }

    // NOTE: mikrotik_profile is required by schema.
    // Phase F convention across the backend is `hotspot_{bundle_id}`.
    // Since we only get the id after INSERT, we set a unique placeholder then update.
    const mikrotik_profile = `pending_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;

    const columns = ['name', 'duration_minutes', 'mikrotik_profile', 'price_ugx', 'is_active', 'created_at'];
    const values = ['$1', '$2', '$3', '$4', '$5', 'NOW()'];
    const params = [name, duration_minutes, mikrotik_profile, price_ugx, true];

    if (hasDescription) {
      columns.push('description');
      values.push(`$${params.length + 1}`);
      params.push(description);
    }

    if (hasUpdatedAt) {
      columns.push('updated_at');
      values.push('NOW()');
    }

    const result = await query(
      `
      WITH ins AS (
        INSERT INTO packages (${columns.join(', ')})
        VALUES (${values.join(', ')})
        RETURNING id
      )
      UPDATE packages p
      SET mikrotik_profile = CONCAT('hotspot_', ins.id)
      FROM ins
      WHERE p.id = ins.id
      RETURNING p.id::text AS id
      `,
      params
    );

    const id = result.rows?.[0]?.id;
    return res.status(201).json({ success: true, id: String(id) });
  } catch (err) {
    if (err?.code === '23505') {
      // If bundles are soft-deleted (deleted_at), allow re-creating a bundle with the same
      // name by restoring the previously deleted row.
      try {
        const hasDeletedAt = await hasPublicTableColumn({ table: 'packages', column: 'deleted_at' });
        if (hasDeletedAt) {
          const existing = await query(
            `
            SELECT id, deleted_at
            FROM packages
            WHERE name = $1
            LIMIT 1
            `,
            [name]
          );

          const row = existing.rows?.[0] ?? null;
          if (row?.id && row?.deleted_at) {
            const hasDescription = await hasPublicTableColumn({ table: 'packages', column: 'description' });
            const hasUpdatedAt = await hasPublicTableColumn({ table: 'packages', column: 'updated_at' });

            const setParts = ['duration_minutes = $2', 'price_ugx = $3', 'is_active = TRUE', 'deleted_at = NULL'];
            const params = [Number(row.id), duration_minutes, price_ugx];

            if (hasDescription) {
              setParts.push(`description = $${params.length + 1}`);
              params.push(description);
            }

            if (hasUpdatedAt) {
              setParts.push('updated_at = NOW()');
            }

            const restored = await query(
              `
              UPDATE packages
              SET ${setParts.join(', ')}, mikrotik_profile = CONCAT('hotspot_', id)
              WHERE id = $1::bigint
              RETURNING id::text AS id
              `,
              params
            );

            const id = restored.rows?.[0]?.id;
            if (id) {
              return res.status(201).json({ success: true, id: String(id) });
            }
          }
        }
      } catch (restoreErr) {
        console.warn('[Bundles] createBundle restore attempt failed', {
          code: restoreErr?.code ?? null,
          message: restoreErr?.message ?? String(restoreErr),
        });
      }

      return res.status(409).json({ success: false, error: { code: 'CONFLICT', message: 'Bundle name already exists' } });
    }
    console.error('[Bundles] createBundle failed', { code: err?.code ?? null, message: err?.message ?? String(err) });
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
}

export async function updateBundle(req, res) {
  try {
    console.info('PUT /api/bundles/:id');
    const idNum = parseIdParam(req);
    if (!idNum) {
      return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid bundle id' } });
    }

    const name = normalizeText(req.body?.name);
    const duration_minutes = parsePositiveInt(req.body?.duration_minutes ?? req.body?.duration);
    const price_ugx = parsePositiveInt(req.body?.price_ugx ?? req.body?.price);
    const description = normalizeText(req.body?.description);

    if (!name) {
      return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'name is required' } });
    }
    if (!duration_minutes) {
      return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'duration_minutes is required' } });
    }
    if (!price_ugx) {
      return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'price_ugx is required' } });
    }

    const hasDescription = await hasPublicTableColumn({ table: 'packages', column: 'description' });
    const hasDeletedAt = await hasPublicTableColumn({ table: 'packages', column: 'deleted_at' });

    const setParts = ['name = $2', 'duration_minutes = $3', 'price_ugx = $4'];
    const params = [idNum, name, duration_minutes, price_ugx];

    if (hasDescription) {
      setParts.push(`description = $${params.length + 1}`);
      params.push(description);
    }

    const result = await query(
      `
      UPDATE packages
      SET ${setParts.join(', ')}
      WHERE id = $1::bigint
        ${hasDeletedAt ? 'AND deleted_at IS NULL' : ''}
      RETURNING id::text AS id
      `,
      params
    );

    if (!result.rows?.[0]?.id) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Bundle not found' } });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    if (err?.code === '23505') {
      return res.status(409).json({ success: false, error: { code: 'CONFLICT', message: 'Bundle name already exists' } });
    }
    console.error('[Bundles] updateBundle failed', { code: err?.code ?? null, message: err?.message ?? String(err) });
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
}

export async function patchBundleStatus(req, res) {
  try {
    console.info('PATCH /api/bundles/:id/status');
    const idNum = parseIdParam(req);
    if (!idNum) {
      return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid bundle id' } });
    }

    const wanted = parseStatus(req.body?.status ?? req.body?.value);
    if (!wanted) {
      return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'status must be active or disabled' } });
    }

    const is_active = wanted === 'active';

    const hasDeletedAt = await hasPublicTableColumn({ table: 'packages', column: 'deleted_at' });

    const result = await query(
      `
      UPDATE packages
      SET is_active = $2
      WHERE id = $1::bigint
        ${hasDeletedAt ? 'AND deleted_at IS NULL' : ''}
      RETURNING id
      `,
      [idNum, is_active]
    );

    if (!result.rows?.[0]?.id) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Bundle not found' } });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[Bundles] patchBundleStatus failed', { code: err?.code ?? null, message: err?.message ?? String(err) });
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
}

export async function deleteBundle(req, res) {
  try {
    console.info('DELETE /api/bundles/:id');
    const idNum = parseIdParam(req);
    if (!idNum) {
      return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid bundle id' } });
    }

    // Soft-delete: removes bundle globally from all bundle listings,
    // while preserving historical references (transactions, vouchers, etc).
    const hasDeletedAt = await hasPublicTableColumn({ table: 'packages', column: 'deleted_at' });
    if (hasDeletedAt) {
      const result = await query(
        `
        UPDATE packages
        SET deleted_at = NOW(), is_active = FALSE
        WHERE id = $1::bigint
          AND deleted_at IS NULL
        RETURNING id
        `,
        [idNum]
      );

      if (!result.rows?.[0]?.id) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Bundle not found' } });
      }

      return res.status(200).json({ success: true });
    }

    // Fallback for older DBs without deleted_at.
    const result = await query(
      `
      DELETE FROM packages
      WHERE id = $1::bigint
      RETURNING id
      `,
      [idNum]
    );
    if (!result.rows?.[0]?.id) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Bundle not found' } });
    }
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[Bundles] deleteBundle failed', { code: err?.code ?? null, message: err?.message ?? String(err) });
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
}
