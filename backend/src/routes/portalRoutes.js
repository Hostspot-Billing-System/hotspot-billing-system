import { Router } from 'express';
import { getPortalBundlesHandler, getPortalContextHandler } from '../controllers/portalController.js';

const router = Router();

// Public captive portal bootstrap (no auth, no MikroTik actions)
router.get('/context', getPortalContextHandler);
router.get('/bundles', getPortalBundlesHandler);

export default router;
