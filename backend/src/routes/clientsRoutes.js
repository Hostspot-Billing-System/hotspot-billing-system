import { Router } from 'express';
import { getClientsOverview } from '../controllers/clientsController.js';

const router = Router();

// READ-ONLY clients analytics
router.get('/overview', getClientsOverview);

export default router;
