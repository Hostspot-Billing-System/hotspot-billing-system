import { Router } from 'express';
import { listPackages } from '../controllers/packagesController.js';

const router = Router();

// Admin
// GET /api/packages
router.get('/', listPackages);

export default router;
