/* JPKCom Desktop — tests: core/net.js timeout, abort and size limit over the whole transfer — © Jean Pierre Kolb — MIT License

   A local server that answers, then stalls or breaks off in the middle of the body. */

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { request, getJson, getText, NetError } from '../src/core/net.js';

const sockets = new Set();
const server = createServer((req, res) => {
	const path = req.url;
	if (path === '/ok') {
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end('{"a":1}');
	} else if (path === '/text') {
		res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
		res.end(`${String.fromCharCode(0xfeff)}Hällo`);
	} else if (path === '/stall') {
		res.writeHead(200, { 'Content-Type': 'text/plain' });
		res.write('partial…'); // and never ends
	} else if (path === '/reset') {
		res.writeHead(200, { 'Content-Type': 'text/plain', 'Content-Length': '1000' });
		res.write('only a part');
		setTimeout(() => req.socket.destroy(), 30);
	} else if (path === '/big') {
		res.writeHead(200, { 'Content-Type': 'text/plain' });
		res.end('x'.repeat(5000));
	} else if (path === '/bigdeclared') {
		res.writeHead(200, { 'Content-Type': 'text/plain', 'Content-Length': '5000' });
		res.end('x'.repeat(5000));
	} else if (path === '/slowhead') {
		setTimeout(() => {
			res.writeHead(200);
			res.end('late');
		}, 300);
	} else if (path === '/bad') {
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end('{nope');
	} else {
		res.writeHead(404);
		res.end('no');
	}
});
server.on('connection', s => {
	sockets.add(s);
	s.on('close', () => sockets.delete(s));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
after(() => {
	for (const s of sockets) s.destroy();
	server.close();
});

const code = async (p, c) => {
	await assert.rejects(p, err => {
		assert.ok(err instanceof NetError, `NetError, got ${err?.name}: ${err?.message}`);
		assert.equal(err.code, c);
		return true;
	});
};

test('net: getJson/getText read the body (BOM dropped like Response.text())', async () => {
	assert.deepEqual(await getJson(`${base}/ok`), { a: 1 });
	assert.equal(await getText(`${base}/text`), 'Hällo');
	const res = await request(`${base}/ok`);
	assert.equal(res.status, 200, 'without read: the Response');
	assert.deepEqual(await res.json(), { a: 1 });
});

test('net: the timeout covers a body that stalls', async () => {
	const t0 = Date.now();
	await code(getText(`${base}/stall`, { timeout: 200 }), 'timeout');
	assert.ok(Date.now() - t0 < 1500);
});

test('net: the caller\'s signal cancels a body that is still downloading', async () => {
	const ctrl = new AbortController();
	setTimeout(() => ctrl.abort(), 100);
	await code(getText(`${base}/stall`, { timeout: 5000, signal: ctrl.signal }), 'aborted');
});

test('net: a signal that is already aborted fails at once', async () => {
	const ctrl = new AbortController();
	ctrl.abort();
	const t0 = Date.now();
	await code(getText(`${base}/slowhead`, { signal: ctrl.signal }), 'aborted');
	assert.ok(Date.now() - t0 < 200);
});

test('net: a connection lost mid-body is a NetError network, invalid JSON a parse error', async () => {
	await code(getText(`${base}/reset`), 'network');
	await code(getJson(`${base}/reset`), 'network');
	await code(getJson(`${base}/bad`), 'parse');
	await code(getText(`${base}/missing`), 'http');
});

test('net: maxBytes stops the transfer (declared or counted)', async () => {
	await code(getText(`${base}/big`, { maxBytes: 1000 }), 'size');
	await code(getText(`${base}/bigdeclared`, { maxBytes: 1000 }), 'size');
	assert.equal((await getText(`${base}/big`, { maxBytes: 5000 })).length, 5000);
	assert.equal((await request(`${base}/big`, { read: 'bytes' })).byteLength, 5000);
	assert.equal((await request(`${base}/big`, { read: 'blob' })).size, 5000);
	await assert.rejects(request(`${base}/ok`, { read: 'xml' }), TypeError);
});

test('net: onHeaders hands over the headers of a read request (before the body)', async () => {
	let type = null;
	const blob = await request(`${base}/big`, { read: 'blob', maxBytes: 5000, onHeaders: h => { type = h.get('content-type'); } });
	assert.equal(type, 'text/plain');
	assert.equal(blob.size, 5000);
	let called = false;
	await code(request(`${base}/bigdeclared`, { read: 'blob', maxBytes: 1000, onHeaders: () => { called = true; } }), 'size');
	assert.equal(called, true, 'called before the size check of the body');
});
