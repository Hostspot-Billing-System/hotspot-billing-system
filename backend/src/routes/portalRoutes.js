import { Router } from 'express';
import { getPortalContextHandler } from '../controllers/portalController.js';

const router = Router();

// Public captive portal bootstrap (no auth, no MikroTik actions)
router.get('/context', getPortalContextHandler);

export default router;
