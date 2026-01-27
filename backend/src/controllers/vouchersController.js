import { VoucherUploadService, toHttpError } from '../services/voucherUploadService.js';

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
