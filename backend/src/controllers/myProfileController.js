import {
  changeOwnerPasswordByUserId,
  getMyProfileUserId,
  getOwnerProfileByUserId,
  toPublicAccountInfo,
  toPublicOwnerProfile,
  updateOwnerUsernameByUserId,
  updateOwnerProfileByUserId,
} from '../services/ownerProfileService.js';

function toErrorBody(err) {
  const msg = String(err?.message ?? 'Something went wrong');
  return { success: false, error: { code: 'BAD_REQUEST', message: msg } };
}

export async function getMyProfileHandler(req, res) {
  try {
    const userId = getMyProfileUserId(req);
    const row = await getOwnerProfileByUserId(userId);

    return res.status(200).json({
      success: true,
      data: {
        profile: toPublicOwnerProfile(row) ?? {
          username: 'Owner',
          email: '',
          phone_number: '',
          business_name: '',
          business_address: '',
        },
        account: toPublicAccountInfo(row) ?? {
          account_status: 'Active',
          account_expires_at: null,
          time_remaining_days: null,
          commission_rate: 0.06,
          member_since: null,
          last_login_at: null,
        },
      },
    });
  } catch (err) {
    return res.status(400).json(toErrorBody(err));
  }
}

export async function putMyProfileHandler(req, res) {
  try {
    const userId = getMyProfileUserId(req);
    const row = await updateOwnerProfileByUserId(userId, req.body ?? {});

    return res.status(200).json({
      success: true,
      data: {
        profile: toPublicOwnerProfile(row),
        account: toPublicAccountInfo(row),
      },
    });
  } catch (err) {
    return res.status(400).json(toErrorBody(err));
  }
}

export async function postMyProfileChangePasswordHandler(req, res) {
  try {
    const userId = getMyProfileUserId(req);

    const current_password = req.body?.current_password;
    const new_password = req.body?.new_password;
    const confirm_new_password = req.body?.confirm_new_password;
    const new_username = req.body?.new_username;

    if (new_username != null && String(new_username).trim() !== '') {
      const updated = await updateOwnerUsernameByUserId(userId, new_username);
      if (req.session?.user && updated?.username) {
        req.session.user.username = String(updated.username);
      }
    }

    await changeOwnerPasswordByUserId(userId, {
      current_password,
      new_password,
      confirm_new_password,
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(400).json(toErrorBody(err));
  }
}
