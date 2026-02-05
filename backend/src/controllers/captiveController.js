import { VoucherService, toHttpError as toVoucherHttpError } from '../services/voucherService.js';

export async function captiveLogin(req, res) {
  try {
    const result = await VoucherService.redeemVoucherForSession(req.body);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    const voucherHttp = toVoucherHttpError(err);
    return res.status(voucherHttp.httpStatus).json(voucherHttp.body);
  }
}
