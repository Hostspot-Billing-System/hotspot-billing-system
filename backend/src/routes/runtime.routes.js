import express from 'express';
import { mikrotikRuntimeService } from '../services/mikrotikRuntimeService.js';

const router = express.Router();

router.get('/health', async (req, res) => {
  try {
    const status = await mikrotikRuntimeService.health();
    res.json({
      success: true,
      status: status?.status ?? 'offline',
      identity: status?.identity ?? null,
      mode: status?.mode ?? 'real',
      error: status?.status === 'offline' ? status?.error ?? 'MikroTik is offline' : undefined,
      code: status?.status === 'offline' ? status?.code ?? null : undefined,
    });
  } catch (err) {
    console.error('[Runtime Health]', err);
    res.status(200).json({
      success: true,
      status: 'offline',
      identity: null,
      mode: 'real',
      error: err?.message || 'Runtime health check failed',
      code: err?.code ?? null,
    });
  }
});

router.get('/bundles', async (req, res) => {
  try {
    const data = await mikrotikRuntimeService.listBundles();
    res.json({ success: true, data });
  } catch (err) {
    console.error('[Runtime Bundles]', err);
    res.status(503).json({
      success: false,
      error: err.message || 'Failed to fetch bundles',
    });
  }
});

router.get('/active', async (req, res) => {
  try {
    const data = await mikrotikRuntimeService.listActiveSessions();
    res.json({ success: true, data });
  } catch (err) {
    console.error('[Runtime Active]', err);
    res.status(503).json({
      success: false,
      error: err.message || 'Failed to fetch active sessions',
    });
  }
});

router.post('/voucher', async (req, res) => {
  try {
    const { code, profile } = req.body ?? {};
    if (!code || !profile) {
      return res.status(400).json({
        success: false,
        error: 'code and profile are required',
      });
    }

    await mikrotikRuntimeService.createVoucher({ code, profile });
    res.json({ success: true });
  } catch (err) {
    console.error('[Runtime Voucher]', err);
    res.status(503).json({
      success: false,
      error: err.message || 'Failed to create voucher',
    });
  }
});

router.post('/disconnect', async (req, res) => {
  try {
    const { username } = req.body ?? {};
    if (!username) {
      return res.status(400).json({
        success: false,
        error: 'username is required',
      });
    }

    await mikrotikRuntimeService.disconnectUser(username);
    res.json({ success: true });
  } catch (err) {
    console.error('[Runtime Disconnect]', err);
    res.status(503).json({
      success: false,
      error: err.message || 'Failed to disconnect user',
    });
  }
});

export default router;
