import { Router } from 'express';
import {
  disableHotspotUserHandler,
  enableHotspotUserHandler,
  getHotspotUserHandler,
  listHotspotActiveHandler,
  upsertHotspotUserHandler,
} from '../controllers/runtimeHotspotController.js';

const router = Router();

// Phase F: runtime-only MikroTik integration (no payments, no captive UI)

// Create or update hotspot user (voucher-based)
router.post('/hotspot/users', upsertHotspotUserHandler);

// Safe control: enable/disable only
router.post('/hotspot/users/:username/enable', enableHotspotUserHandler);
router.post('/hotspot/users/:username/disable', disableHotspotUserHandler);

// Read: user details
router.get('/hotspot/users/:username', getHotspotUserHandler);

// Read: active sessions + usage (bytes in/out)
router.get('/hotspot/active', listHotspotActiveHandler);

export default router;
