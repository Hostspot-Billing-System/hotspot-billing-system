import { Router } from 'express';
import {
	getPortalBundlesHandler,
	getPortalContextHandler,
	getPortalStatusHandler,
	postPortalPaymentCallbackHandler,
	postPortalPayHandler,
	postPortalVoucherLoginHandler,
} from '../controllers/portalController.js';

const router = Router();

// Public captive portal bootstrap (no auth, no MikroTik actions)
router.get('/context', getPortalContextHandler);
router.get('/bundles', getPortalBundlesHandler);

// Polling endpoint for portal UI
router.get('/status', getPortalStatusHandler);

// Voucher login for captive portal users
router.post('/voucher-login', postPortalVoucherLoginHandler);

// Mobile money payment initiation (no access granted here)
router.post('/pay', postPortalPayHandler);

// Mobile money payment callback/webhook
router.post('/payment-callback', postPortalPaymentCallbackHandler);

export default router;
