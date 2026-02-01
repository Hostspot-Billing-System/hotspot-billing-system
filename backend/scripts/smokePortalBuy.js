import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

async function main() {
	// Ensure dotenv picks up backend/.env (env.js uses dotenv.config() with cwd).
	const here = dirname(fileURLToPath(import.meta.url));
	const backendDir = resolve(here, '..');
	process.chdir(backendDir);

	await import('../src/config/env.js');
	const { default: app } = await import('../src/app.js');

	const server = await new Promise((resolve, reject) => {
		const s = app.listen(0, () => resolve(s));
		s.on('error', reject);
	});

	const port = server.address()?.port;
	if (!port) throw new Error('Failed to allocate a listening port');

	try {
		const r = await fetch(`http://localhost:${port}/api/portal/buy`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ phone: '256707432418', bundle: '24Hrs' }),
		});
		console.log('status', r.status);
		console.log(await r.text());
	} finally {
		await new Promise((resolve) => server.close(resolve));
	}
}

main().catch((err) => {
	console.error(err);
	process.exitCode = 1;
});
