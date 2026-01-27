import { Router } from 'express';
import { captiveLogin } from '../controllers/captiveController.js';

const router = Router();

// Captive Portal
// POST /api/captive/login
router.post('/login', captiveLogin);

export default router;
