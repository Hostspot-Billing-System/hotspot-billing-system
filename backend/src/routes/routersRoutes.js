import { Router } from 'express';
import { createRouter, deleteRouter, listRouters, testRouterConnection } from '../controllers/routersController.js';

const router = Router();

// READ-ONLY list (no secrets returned)
router.get('/', listRouters);

// Create
router.post('/', createRouter);

// Test connectivity (mock + real-ready)
router.post('/:id/test', testRouterConnection);

// Delete
router.delete('/:id', deleteRouter);

export default router;
