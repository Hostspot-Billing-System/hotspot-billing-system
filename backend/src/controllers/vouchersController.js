import { VoucherUploadService, toHttpError } from '../services/voucherUploadService.js';
import { VouchersService, toHttpError as toHttpErrorVouchers } from '../services/vouchersService.js';

export async function uploadVouchersCsv(req, res) {
  try {
    const package_id = req.body?.package_id;
    const file = req.file;

    const result = await VoucherUploadService.uploadCsv({
      package_id,
      filename: file?.originalname,
      fileBuffer: file?.buffer,
    });

    return res.status(201).json({
      success: true,
      batch_id: result.batch_id,
      inserted: result.inserted,
    });
  } catch (err) {
    const { httpStatus, body } = toHttpError(err);
    return res.status(httpStatus).json(body);
  }
}

export async function listVouchers(req, res) {
  try {
    console.info('GET /api/vouchers');
    const rows = await VouchersService.listVouchers({
      status: req.query?.status,
      packageId: req.query?.package_id,
      batchId: req.query?.batch_id,
    });

    return res.status(200).json({
      success: true,
      data: rows,
    });
  } catch (err) {
    const { httpStatus, body } = toHttpErrorVouchers(err);
    return res.status(httpStatus).json(body);
  }
}

export async function deleteVoucher(req, res) {
  try {
    console.info('DELETE /api/vouchers/:id');
    await VouchersService.deleteVoucherById(req.params?.id);
    return res.status(200).json({ success: true });
  } catch (err) {
    const { httpStatus, body } = toHttpErrorVouchers(err);
    return res.status(httpStatus).json(body);
  }
}

export async function deleteBulkVouchers(req, res) {
  try {
    console.info('POST /api/vouchers/delete-bulk');
    const result = await VouchersService.deleteBulk({ ids: req.body?.ids });
    return res.status(200).json({
      success: true,
      deleted: result.deleted,
    });
  } catch (err) {
    const { httpStatus, body } = toHttpErrorVouchers(err);
    return res.status(httpStatus).json(body);
  }
}

export async function redeemVoucher(req, res) {
  try {
    console.info('POST /api/vouchers/redeem');
    const code = req.body?.code;
    if (!String(code ?? '').trim()) {
      return res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'code is required' },
      });
    }

    const redeemed = await VouchersService.redeemVoucher(code);
    return res.status(200).json({
      success: true,
      data: redeemed,
    });
  } catch (err) {
    const { httpStatus, body } = toHttpErrorVouchers(err);
    return res.status(httpStatus).json(body);
  }
}

export async function verifyVoucher(req, res) {
  try {
    console.info('GET /api/vouchers/verify');
    const code = req.query?.code;
    if (!String(code ?? '').trim()) {
      return res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'code is required' },
      });
    }

    const data = await VouchersService.verifyVoucher(code);
    return res.status(200).json({
      success: true,
      data,
    });
  } catch (err) {
    const { httpStatus, body } = toHttpErrorVouchers(err);
    return res.status(httpStatus).json(body);
  }
}
