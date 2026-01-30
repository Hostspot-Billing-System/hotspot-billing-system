import { WithdrawalsService, toHttpError } from '../services/withdrawalsService.js';

export async function getWithdrawableBalance(req, res) {
  try {
    const withdrawable = await WithdrawalsService.getWithdrawableBalance({
      agent_id: req.query?.agent_id,
      client_id: req.query?.client_id,
    });

    return res.status(200).json({
      success: true,
      withdrawable_amount_ugx: withdrawable,
    });
  } catch (err) {
    const { httpStatus, body } = toHttpError(err);
    return res.status(httpStatus).json(body);
  }
}

export async function requestWithdrawal(req, res) {
  try {
    const body = req.body ?? {};
    const created = await WithdrawalsService.requestWithdrawal({
      payout_method: body.payout_method,
      payout_account: body.payout_account,
      agent_id: body.agent_id,
      client_id: body.client_id,
    });

    return res.status(201).json({
      success: true,
      data: created,
    });
  } catch (err) {
    const { httpStatus, body } = toHttpError(err);
    return res.status(httpStatus).json(body);
  }
}

export async function listWithdrawals(req, res) {
  try {
    const result = await WithdrawalsService.listWithdrawals({
      page: req.query?.page,
      perPage: req.query?.perPage ?? req.query?.per_page,
    });

    return res.status(200).json({
      success: true,
      meta: result.meta,
      data: result.data,
    });
  } catch (err) {
    const { httpStatus, body } = toHttpError(err);
    return res.status(httpStatus).json(body);
  }
}

export async function getWithdrawalById(req, res) {
  try {
    const result = await WithdrawalsService.getWithdrawalById(req.params?.id);
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    const { httpStatus, body } = toHttpError(err);
    return res.status(httpStatus).json(body);
  }
}
