import { Router } from 'express';
import { listMikroTikSessionsHandler } from '../controllers/mikrotikSessionsController.js';
import { disconnectMikroTikUserHandler } from '../controllers/mikrotikDisconnectController.js';
import { getMikroTikStatusHandler } from '../controllers/mikrotikStatusController.js';

const router = Router();

router.get('/sessions', listMikroTikSessionsHandler);

router.get('/status', getMikroTikStatusHandler);

router.post('/disconnect', disconnectMikroTikUserHandler);

export default router;
