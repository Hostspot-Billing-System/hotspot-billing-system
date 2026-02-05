import { Router } from 'express';
import {
  flutterwaveWebhookHandler,
  getPaymentStatusByTxRef,
  initiateFlutterwaveMobileMoneyPayment,
} from '../controllers/flutterwavePaymentsController.js';

const router = Router();

// POST /api/payments/flutterwave/initiate
router.post('/flutterwave/initiate', initiateFlutterwaveMobileMoneyPayment);

// POST /api/payments/flutterwave/webhook
router.post('/flutterwave/webhook', flutterwaveWebhookHandler);

// GET /api/payments/status/:tx_ref
router.get('/status/:tx_ref', getPaymentStatusByTxRef);

export default router;
