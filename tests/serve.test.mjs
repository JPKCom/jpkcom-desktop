/* JPKCom Desktop — tests: the local server sends the production Permissions-Policy — © Jean Pierre Kolb — MIT License

   npm run serve promises the headers of a real deployment; every shipped server config sends
   geolocation=() unless the site opts in. Starts tools/serve.mjs on a free port and compares. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PERMISSIONS = 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()';

const freePort = () => new Promise(r => {
	const s = createServer().listen(0, '127.0.0.1', () => {
		const { port } = s.address();
		s.close(() => r(port));
	});
});

async function headersOf(extra = []) {
	const port = await freePort();
	const child = spawn(process.execPath, ['tools/serve.mjs', '--port', String(port), ...extra], { cwd: PROJECT, stdio: ['ignore', 'pipe', 'pipe'] });
	try {
		await new Promise((ok, fail) => {
			child.stdout.on('data', d => { if (String(d).includes('http://')) ok(); });
			child.on('exit', c => fail(new Error(`serve.mjs exited with ${c}`)));
			setTimeout(() => fail(new Error('serve.mjs did not start')), 5000);
		});
		const res = await fetch(`http://127.0.0.1:${port}/`);
		await res.arrayBuffer();
		return res.headers;
	} finally {
		child.kill();
	}
}

test('serve.mjs: Permissions-Policy equals production; geolocation only with --geolocation', async () => {
	assert.equal((await headersOf()).get('permissions-policy'), PERMISSIONS);
	assert.equal((await headersOf(['--geolocation'])).get('permissions-policy'), PERMISSIONS.replace('geolocation=()', 'geolocation=(self)'));
});
