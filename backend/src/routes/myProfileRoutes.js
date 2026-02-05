import { Router } from 'express';
import {
  getMyProfileHandler,
  postMyProfileChangePasswordHandler,
  putMyProfileHandler,
} from '../controllers/myProfileController.js';

const router = Router();

// GET /api/my-profile
router.get('/', getMyProfileHandler);

// PUT /api/my-profile
router.put('/', putMyProfileHandler);

// POST /api/my-profile/change-password
router.post('/change-password', postMyProfileChangePasswordHandler);

export default router;
