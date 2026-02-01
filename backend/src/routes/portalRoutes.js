import { Router } from 'express';
import {
	getPortalBundlesHandler,
	getPortalHealthHandler,
	getPortalContextHandler,
	getPortalStatusHandler,
	postPortalPaymentCallbackHandler,
	postPortalPayHandler,
	postPortalBuyBundleHandler,
	postPortalVoucherConnectHandler,
	postPortalVoucherLoginHandler,
} from '../controllers/portalController.js';

const router = Router();

// Public captive portal bootstrap (no auth, no MikroTik actions)
router.get('/context', getPortalContextHandler);
router.get('/bundles', getPortalBundlesHandler);

// Portal runtime health (DB + MikroTik)
router.get('/health', getPortalHealthHandler);

// Polling endpoint for portal UI
router.get('/status', getPortalStatusHandler);

// Voucher login for captive portal users
router.post('/voucher-login', postPortalVoucherLoginHandler);

// Voucher CONNECT flow (Phase G1.2)
router.post('/voucher/connect', postPortalVoucherConnectHandler);

// Buy bundle (Phase G2.1 - mocked payment)
router.post('/buy', postPortalBuyBundleHandler);

// Mobile money payment initiation (no access granted here)
router.post('/pay', postPortalPayHandler);

// Mobile money payment callback/webhook
router.post('/payment-callback', postPortalPaymentCallbackHandler);

export default router;
