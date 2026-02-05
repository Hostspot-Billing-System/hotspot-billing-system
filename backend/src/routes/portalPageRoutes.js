import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve to workspace root: backend/src/routes -> backend -> <root>
const distDir = path.resolve(__dirname, '..', '..', '..', 'frontend', 'dist');

// Serve built static assets for the portal UI.
// Scoped to known public paths to avoid intercepting API routes.
router.use('/assets', express.static(path.resolve(distDir, 'assets'), { fallthrough: true }));
router.get('/favicon.ico', (_req, res, next) => {
	res.sendFile(path.resolve(distDir, 'favicon.ico'), (err) => (err ? next() : undefined));
});

// Public captive portal entry point (used by MikroTik redirect)
router.get('/portal', (_req, res) => {
	res.sendFile(path.resolve(distDir, 'index.html'));
});

export default router;
