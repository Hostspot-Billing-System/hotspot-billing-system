import { Router } from 'express';
import { listPackages, listPackagesFull } from '../controllers/packagesController.js';

const router = Router();

// Admin
// GET /api/packages
router.get('/', listPackages);

// GET /api/packages/full
router.get('/full', listPackagesFull);

export default router;
