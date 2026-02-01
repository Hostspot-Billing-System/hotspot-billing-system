import { Router } from 'express';
import {
  runtimeBundlesHandler,
  runtimeHealthHandler,
  runtimeHotspotActiveHandler,
  runtimeHotspotDisconnectHandler,
  runtimeHotspotUserDeleteHandler,
  runtimeHotspotUserUpsertHandler,
  runtimeHotspotUsersListHandler,
} from '../controllers/runtimeController.js';
import {
  disableHotspotUserHandler,
  enableHotspotUserHandler,
  getHotspotUserHandler,
} from '../controllers/runtimeHotspotController.js';

const router = Router();

// Phase F: runtime-only MikroTik integration (no payments, no captive UI)

// Runtime health (router API login + identity)
router.get('/health', runtimeHealthHandler);

// Bundles == RouterOS hotspot user profiles
router.get('/bundles', runtimeBundlesHandler);

// Hotspot users
router.get('/hotspot/users', runtimeHotspotUsersListHandler);
router.post('/hotspot/users', runtimeHotspotUserUpsertHandler);
router.delete('/hotspot/users/:username', runtimeHotspotUserDeleteHandler);

// Active sessions
router.get('/hotspot/active', runtimeHotspotActiveHandler);

// Disconnect active user sessions
router.post('/hotspot/disconnect', runtimeHotspotDisconnectHandler);

// Safe control: enable/disable only
router.post('/hotspot/users/:username/enable', enableHotspotUserHandler);
router.post('/hotspot/users/:username/disable', disableHotspotUserHandler);

// Read: user details
router.get('/hotspot/users/:username', getHotspotUserHandler);

export default router;
