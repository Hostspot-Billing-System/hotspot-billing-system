import { Router } from 'express';
import {
  createBundle,
  deleteBundle,
  listBundles,
  patchBundleStatus,
  updateBundle,
} from '../controllers/bundlesController.js';

const router = Router();

// GET /api/bundles?status=active|disabled
router.get('/', listBundles);

// POST /api/bundles
router.post('/', createBundle);

// PUT /api/bundles/:id
router.put('/:id', updateBundle);

// PATCH /api/bundles/:id/status
router.patch('/:id/status', patchBundleStatus);

// DELETE /api/bundles/:id
router.delete('/:id', deleteBundle);

export default router;
