import {
  getHotspotUser,
  listHotspotActive,
  setHotspotUserDisabled,
  upsertHotspotUser,
} from '../services/mikrotikRuntime/runtimeService.js';
import { toHttpError } from '../services/mikrotikRuntime/errors.js';

export async function upsertHotspotUserHandler(req, res) {
  try {
    const result = await upsertHotspotUser(req.body);
    return res.status(result?.action === 'created' ? 201 : 200).json({
      success: true,
      action: result.action,
      user: result.user,
    });
  } catch (err) {
    const { httpStatus, body } = toHttpError(err);
    return res.status(httpStatus).json(body);
  }
}

export async function enableHotspotUserHandler(req, res) {
  try {
    const username = req.params?.username;
    const result = await setHotspotUserDisabled({ username, disabled: false });
    if (!result.ok) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Hotspot user not found' },
      });
    }

    return res.status(200).json({ success: true, user: result.user });
  } catch (err) {
    const { httpStatus, body } = toHttpError(err);
    return res.status(httpStatus).json(body);
  }
}

export async function disableHotspotUserHandler(req, res) {
  try {
    const username = req.params?.username;
    const result = await setHotspotUserDisabled({ username, disabled: true });
    if (!result.ok) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Hotspot user not found' },
      });
    }

    return res.status(200).json({ success: true, user: result.user });
  } catch (err) {
    const { httpStatus, body } = toHttpError(err);
    return res.status(httpStatus).json(body);
  }
}

export async function getHotspotUserHandler(req, res) {
  try {
    const username = req.params?.username;
    const user = await getHotspotUser(username);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Hotspot user not found' },
      });
    }

    return res.status(200).json({ success: true, user });
  } catch (err) {
    const { httpStatus, body } = toHttpError(err);
    return res.status(httpStatus).json(body);
  }
}

export async function listHotspotActiveHandler(req, res) {
  try {
    const user = req.query?.user;
    const sessions = await listHotspotActive({ user });
    return res.status(200).json({ success: true, data: sessions });
  } catch (err) {
    const { httpStatus, body } = toHttpError(err);
    return res.status(httpStatus).json(body);
  }
}
