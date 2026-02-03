import { Router } from 'express';
import { getSmsSettingsHandler, putSmsSettingsHandler } from '../controllers/smsSettingsController.js';

const router = Router();

// GET /api/sms-settings
router.get('/', getSmsSettingsHandler);

// PUT /api/sms-settings
router.put('/', putSmsSettingsHandler);

export default router;
