import { VoucherService, toHttpError as toVoucherHttpError } from '../services/voucherService.js';
import { MikroTikService, toHttpError as toMikroTikHttpError } from '../services/mikrotikService.js';

export async function captiveLogin(req, res) {
  try {
    const result = await VoucherService.redeemVoucherForSession(req.body);

    // Phase 3: MikroTik integration happens AFTER voucher redeem.
    // username/password: voucher.code, profile: package.mikrotik_profile
    await MikroTikService.createHotspotUser({
      username: result.voucher.code,
      password: result.voucher.code,
      profile: result.voucher.package?.mikrotik_profile,
    });

    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    const mikrotikHttp = toMikroTikHttpError(err);
    if (mikrotikHttp) return res.status(mikrotikHttp.httpStatus).json(mikrotikHttp.body);

    const voucherHttp = toVoucherHttpError(err);
    return res.status(voucherHttp.httpStatus).json(voucherHttp.body);
  }
}
