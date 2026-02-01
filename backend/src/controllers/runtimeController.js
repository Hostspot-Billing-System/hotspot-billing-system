import {
  deleteRuntimeHotspotUser,
  disconnectRuntimeHotspotUser,
  getRuntimeBundles,
  getRuntimeHealth,
  getRuntimeHotspotActive,
  getRuntimeHotspotUsers,
  upsertRuntimeHotspotUser,
} from '../services/mikrotikRuntimeService.js';

import { toHttpError } from '../services/mikrotikRuntime/errors.js';

function normalizeText(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : null;
}

export async function runtimeBundlesHandler(req, res) {
  try {
    const profiles = await getRuntimeBundles();
    return res.status(200).json({ success: true, data: profiles });
  } catch (err) {
    const { httpStatus, body } = toHttpError(err);
    return res.status(httpStatus).json(body);
  }
}

export async function runtimeHotspotUsersListHandler(req, res) {
  try {
    const users = await getRuntimeHotspotUsers();
    return res.status(200).json({ success: true, data: users });
  } catch (err) {
    const { httpStatus, body } = toHttpError(err);
    return res.status(httpStatus).json(body);
  }
}

export async function runtimeHotspotActiveHandler(req, res) {
  try {
    const user = normalizeText(req.query?.user);
    const sessions = await getRuntimeHotspotActive({ user });
    return res.status(200).json({ success: true, data: sessions });
  } catch (err) {
    const { httpStatus, body } = toHttpError(err);
    return res.status(httpStatus).json(body);
  }
}

export async function runtimeHotspotUserUpsertHandler(req, res) {
  try {
    const result = await upsertRuntimeHotspotUser(req.body);
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

export async function runtimeHotspotUserDeleteHandler(req, res) {
  try {
    const username = normalizeText(req.params?.username);
    if (!username) {
      return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'username is required' } });
    }

    const result = await deleteRuntimeHotspotUser({ username });
    if (!result?.ok) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Hotspot user not found' } });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    const { httpStatus, body } = toHttpError(err);
    return res.status(httpStatus).json(body);
  }
}

export async function runtimeHotspotDisconnectHandler(req, res) {
  try {
    const username = normalizeText(req.body?.username ?? req.body?.user);
    if (!username) {
      return res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'username is required' },
      });
    }

    const result = await disconnectRuntimeHotspotUser({ username });
    return res.status(200).json({ success: true, removed: result?.removed ?? 0 });
  } catch (err) {
    const { httpStatus, body } = toHttpError(err);
    return res.status(httpStatus).json(body);
  }
}

export async function runtimeHealthHandler(req, res) {
  try {
    const status = await getRuntimeHealth();
    return res.status(200).json({
      success: true,
      router: {
        online: true,
        identity: status?.identity ?? null,
      },
    });
  } catch (err) {
    const http = toHttpError(err);
    // Ensure stable offline response shape
    if (http?.body?.error?.code) {
      return res.status(http.httpStatus).json({
        success: false,
        router: { online: false, identity: null },
        error: http.body.error,
      });
    }

    return res.status(503).json({
      success: false,
      router: { online: false, identity: null },
      error: { code: 'MIKROTIK_OFFLINE', message: 'MikroTik is offline' },
    });
  }
}
