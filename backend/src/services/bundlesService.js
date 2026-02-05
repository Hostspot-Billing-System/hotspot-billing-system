import { query } from '../config/db.js';

const DEFAULT_PRICE_BY_DURATION_MINUTES = new Map([
	[120, 500], // 2 Hours
	[720, 1000], // 12 Hours
	[1440, 1500], // Daily
	[10080, 6000], // Weekly
	[43200, 23000], // Monthly (30 days)
]);

function toInt(value) {
	const n = Number(value);
	return Number.isFinite(n) ? Math.trunc(n) : null;
}

function normalizeBundleRow(row) {
	const id = toInt(row?.id);
	const durationMinutes = toInt(row?.duration_minutes);

	const computedPrice =
		durationMinutes != null ? DEFAULT_PRICE_BY_DURATION_MINUTES.get(durationMinutes) ?? null : null;

	const priceUgx = toInt(row?.price_ugx ?? computedPrice);

	return {
		id,
		name: row?.name ?? null,
		duration_minutes: durationMinutes,
		price_ugx: priceUgx,
	};
}

export async function listActiveBundles({ dbQuery = query } = {}) {
	// Prefer DB-native fields if available.
	// Older schemas may not have is_active/price_ugx; we fall back gracefully.
	try {
		const res = await dbQuery(
			`
			SELECT
				id::int AS id,
				name,
				duration_minutes::int AS duration_minutes,
				price_ugx::int AS price_ugx
			FROM packages
			WHERE COALESCE(is_active, TRUE) = TRUE
			ORDER BY duration_minutes ASC
			`
		);

		return (res.rows ?? []).map(normalizeBundleRow);
	} catch (err) {
		// 42703: undefined_column (e.g., is_active or price_ugx not present)
		if (err?.code !== '42703') throw err;
	}

	// Fallback: schema without is_active/price_ugx.
	const res = await dbQuery(
		`
		SELECT
			id::int AS id,
			name,
			duration_minutes::int AS duration_minutes
		FROM packages
		ORDER BY duration_minutes ASC
		`
	);

	return (res.rows ?? []).map(normalizeBundleRow);
}
