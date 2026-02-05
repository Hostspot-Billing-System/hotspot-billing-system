import { query } from '../config/db.js';

export class VoucherBatchesService {
  static async listBatches() {
    const result = await query(
      `
      SELECT
        vb.id::int AS id,
        vb.filename,
        vb.description,
        vb.package_id::int AS package_id,
        p.name AS package_name,
        COUNT(v.id)::int AS total_vouchers,
        vb.created_at
      FROM voucher_batches vb
      JOIN packages p ON p.id = vb.package_id
      LEFT JOIN vouchers v ON v.batch_id = vb.id
      GROUP BY vb.id, p.name
      ORDER BY vb.created_at DESC
      `
    );

    return result.rows;
  }
}
