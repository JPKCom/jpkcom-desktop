/* JPKCom Desktop — vault: private encrypted bookmarks, unlocked with login in the terminal — © Jean Pierre Kolb — MIT License

   Sealed files (tools/seal-vault.mjs) lie in config.vault.dir, named after the
   credentials (vault-core.js). `login` in the terminal asks for user name and
   password, derives key and file name, fetches and decrypts the file. While
   unlocked, its groups and items join the collection config.vault.collection
   (first, as the own ones are used most) — so the Catalog, menus, Search and
   the terminal treat them like any bookmark (source 'vault'; never pinnable:
   the dock list lives in localStorage and the backup). A site without that
   collection gets one from the vault: its Catalog app, groups and items go on
   lock, and the collection itself goes with them (registry removeCollection();
   a registry without it keeps the empty collection until the page reloads).

   The plain text stays in memory only. "Stay logged in" keeps just the
   non-extractable CryptoKey (+ file id and user name) in IndexedDB
   '<namespace>-vault'; on 'desk:ready' a kept login opens the vault again
   (after session restore and deep links, §3). A file that is gone means
   changed credentials → the kept login is forgotten; offline → stays locked.

   Service 'vault' (§10):
     available() → boolean            WebCrypto present (secure context)
     unlock(user, pass) → 'ok' | 'denied' | 'offline' | 'unsupported'
     keep() → Promise<boolean>        store the login on this device
     lock() → Promise                 hide the bookmarks, forget a kept login
     forget() → Promise               forget a kept login only
     resume() → Promise               reopen a kept login (runs on 'desk:ready')
     user() → name | null     unlocked() → boolean
     summary() → [{ id, name, count }]   the unlocked groups (name in the current language)
   Event 'vault:change' { unlocked, user } after every unlock and lock.
   Terminal commands (contribution 'terminal', hidden from help): login, logout.
   Settings → Reset shows the vault's row only while it is unlocked or a login
   is kept on this device (visible(), §14) — otherwise nothing there tells a
   visitor that a vault exists; 'storage:groups' tells Settings to redraw. */

import {
	supported, derive, open, fileName, isFileId, clean, cleanConfig, toCollectionItems, collectionDef,
	takenIds, EMPTY_SALT_WARNING
} from './vault-core.js';

const SOURCE = 'vault';
const STORE = 'login';

let D = null;          // the Desk API
let cfg = null;        // cleaned config.vault
let current = null;    // { user, key, file, groups }
let kept = false;      // a login is kept in IndexedDB (written by keep(), found by resume())

/* The reset row follows unlocked || kept; Settings redraws on 'storage:groups' */
const groupsChanged = () => D?.emit('storage:groups', { id: 'vault' });

function setKept(on) {
	if (kept === on) return;
	kept = on;
	groupsChanged();
}

/* ---------- IndexedDB: one record { key, file, user } ---------- */

function idb(mode, fn) {
	return new Promise((resolve, reject) => {
		if (typeof indexedDB === 'undefined') {
			reject(new Error('no IndexedDB'));
			return;
		}
		const req = indexedDB.open(D.store.key('vault'), 1);
		req.onupgradeneeded = () => req.result.createObjectStore(STORE);
		req.onerror = () => reject(req.error);
		req.onsuccess = () => {
			const db = req.result;
			let tx;
			try {
				tx = db.transaction(STORE, mode);
			} catch (err) {
				db.close();
				reject(err);
				return;
			}
			const r = fn(tx.objectStore(STORE));
			tx.oncomplete = () => {
				db.close();
				resolve(r.result);
			};
			tx.onerror = tx.onabort = () => {
				db.close();
				reject(tx.error);
			};
		};
	});
}

const recall = () => idb('readonly', s => s.get(STORE));
const forget = () => idb('readwrite', s => s.delete(STORE)).catch(() => { /* no IndexedDB */ }).then(() => setKept(false));

/* ---------- Files ---------- */

/** The sealed file (bytes), or null when there is none (wrong or changed credentials).
   Throws when offline, on timeout (the body included) or past cfg.maxBytes (NetError 'size',
   the transfer stops there). */
async function fetchVault(file) {
	try {
		return await D.net.request(D.env.asset(`${cfg.dir}${fileName(file)}`),
			{ cache: 'no-cache', timeout: 15000, read: 'bytes', maxBytes: cfg.maxBytes });
	} catch (err) {
		if (err?.code === 'http' && (err.status === 404 || err.status === 410)) return null;
		throw err;
	}
}

/* ---------- In and out of the collection ---------- */

/** The vault's own collection (the site has none): created on unlock, or its app registered
   again when a registry without removeCollection() kept the emptied collection after a lock */
function ensureCollection() {
	const reg = D.apps;
	let col = reg.collection(cfg.collection);
	if (!col) {
		reg.addCollection(collectionDef(cfg.collection, '@vault.collection'), { source: SOURCE });
		col = reg.collection(cfg.collection);
	} else if (col.source === SOURCE && col.app && !reg.has(col.app)) {
		reg.register({
			id: col.app, kind: 'collection', collection: col.id, name: col.name, icon: col.icon, tint: col.tint, size: [880, 580]
		}, { source: SOURCE });
	}
	return col;
}

/**
 * Takes the vault's groups and items out again. On a real lock (`final`) the vault's own collection
 * goes as well, with its Catalog window. A new login over an open one (`final: false`, inject() puts
 * the app back at once via ensureCollection(), before the batched 'apps:change') closes nothing: an
 * open Catalog window just redraws with the new content, as in the original.
 */
function eject({ final = true } = {}) {
	if (!current) return false;
	const col = D.apps.collection(cfg.collection);
	const own = col?.source === SOURCE;
	if (final && own && col.app) {
		const win = D.wm?.get?.(col.app);
		if (win) D.wm.close(win, { force: true });
	}
	D.apps.removeSource(SOURCE);
	/* the emptied collection would still show up in registry.collections() (e.g. as an empty
	   directory in the terminal) — it goes too once the registry can remove one */
	if (final && own && typeof D.apps.removeCollection === 'function') D.apps.removeCollection(col.id);
	current = null;
	return true;
}

function inject(data, login) {
	eject({ final: false });
	const col = ensureCollection();
	if (!col) throw new Error(`vault: collection '${cfg.collection}' could not be created`);
	/* Checked against the manifest as it is now — the vault never replaces a public entry */
	const { groups, items, problems } = clean(data, {
		taken: takenIds(col, D.apps.list({ hidden: true, unavailable: true })),
		icons: id => D.icons.has(id),
		tints: name => Object.hasOwn(D.config.theme.tints ?? {}, name)
	});
	if (problems.length && D.config.debug) console.info(`[vault] left out or replaced:\n  ${problems.join('\n  ')}`);
	D.apps.extendCollection(cfg.collection, { groups, items: toCollectionItems(items), prepend: true }, { source: SOURCE });
	current = { user: login.user, key: login.key, file: login.file, groups };
}

function changed() {
	groupsChanged();
	D.emit('vault:change', { unlocked: current !== null, user: current?.user ?? null });
}

/* ---------- Service ---------- */

const available = () => supported();

/** 'ok', 'denied' (wrong credentials), 'offline' or 'unsupported' */
async function unlock(user, pass) {
	if (!available()) return 'unsupported';
	let login;
	try {
		login = await derive(user, pass, { salt: cfg.salt, iterations: cfg.iterations });
	} catch {
		return 'unsupported';
	}
	let buf;
	try {
		buf = await fetchVault(login.file);
	} catch {
		return 'offline';
	}
	if (!buf) return 'denied';
	let data;
	try {
		data = await open(login.key, buf, { salt: cfg.salt, iterations: cfg.iterations });
	} catch {
		return 'denied';
	}
	inject(data, login);
	changed();
	return 'ok';
}

/** The CryptoKey goes into IndexedDB as it is: usable there, not readable */
async function keep() {
	if (!current) return false;
	try {
		await idb('readwrite', s => s.put({ key: current.key, file: current.file, user: current.user }, STORE));
		setKept(true);
		return true;
	} catch {
		return false;
	}
}

function lock() {
	eject();
	changed();
	return forget();
}

/* At start: a kept login opens the vault again. Gone file = changed
   credentials → forget; offline (never cached) → just stay locked */
async function resume() {
	if (!available() || current) return;
	let rec;
	try {
		rec = await recall();
	} catch {
		return;
	}
	if (rec == null) return;
	/* a login is kept here (also while offline): Settings → Reset may offer to forget it */
	setKept(true);
	const key = typeof CryptoKey === 'function' && rec.key instanceof CryptoKey ? rec.key : null;
	if (!key || !isFileId(rec.file) || typeof rec.user !== 'string' || rec.user.length > 200) {
		await forget();
		return;
	}
	let buf;
	try {
		buf = await fetchVault(rec.file);
	} catch {
		return;
	}
	if (!buf) {
		await forget();
		return;
	}
	let data;
	try {
		data = await open(key, buf);
	} catch {
		await forget();
		return;
	}
	if (current) return;   // a login in the meantime wins
	inject(data, { user: rec.user, key, file: rec.file });
	changed();
}

/** The unlocked groups with the number of their bookmarks that made it into the collection */
function summary() {
	if (!current) return [];
	const apps = D.apps.items(cfg.collection).filter(a => a.source === SOURCE);
	return current.groups.map(g => ({ id: g.id, name: D.L(g.name), count: apps.filter(a => a.group === g.id).length }));
}

const service = Object.freeze({
	available, unlock, keep, lock, forget, resume, summary,
	user: () => current?.user ?? null,
	unlocked: () => current !== null
});

/* ---------- Terminal: login / logout ---------- */

/* io (the terminal, P9): say(text, cls?), err(text), table(rows), dim(text)?,
   readLine(label, { secret }) → Promise<string | null> (null: cancelled) */
const say = (io, text, cls) => io.say?.(text, cls);
const err = (io, text) => (typeof io.err === 'function' ? io.err(text) : say(io, text, 'term-error'));
const dim = (io, text) => (typeof io.dim === 'function' ? io.dim(text) : say(io, text, 'term-dim'));
const t = (key, params) => D.t(`vault.${key}`, params);

/* Takes no arguments: user name and password are asked for, the password in a
   password field that is never echoed. The command is marked sensitive, so the
   terminal stores only "login" in its history (and backups) and echoes "login …"
   even when someone types `login alice secret` — those arguments are ignored. */
async function login(args, io) {
	if (!available() || typeof io?.readLine !== 'function') {
		err(io, t('unsupported'));
		return;
	}
	if (Array.isArray(args) && args.length) dim(io, t('noArgs'));
	const user = await io.readLine(t('user'));
	if (!user?.trim()) return;
	const pass = await io.readLine(t('pass'), { secret: true });
	if (!pass) return;
	dim(io, t('check'));
	const result = await unlock(user, pass);
	if (result !== 'ok') {
		err(io, t(result === 'offline' ? 'offline' : result === 'unsupported' ? 'unsupported' : 'denied'));
		return;
	}
	say(io, t('ok', { user: service.user() }));
	const rows = summary().map(c => [`  ${c.name}`, D.i18n.fmtNumber(c.count)]);
	if (typeof io.table === 'function') io.table(rows);
	else for (const r of rows) say(io, r.join('  '));
	const answer = await io.readLine(t('keep'));
	if (answer != null && D.i18n.isYes(answer)) dim(io, t(await keep() ? 'kept' : 'keepFail'));
}

async function logout(args, io) {
	if (!service.user()) {
		err(io, t('notLoggedIn'));
		return;
	}
	await lock();
	say(io, t('loggedOut'));
}

/* ---------- Descriptor ---------- */

export default {
	id: 'vault',
	kind: 'module',
	i18n: ['vault'],
	configKey: 'vault',
	validateConfig: (section, warn) => cleanConfig(section, warn),

	/* Settings → Reset: sign out on this device (the original did this with "everything") —
	   the row only while there is something to sign out of, so it reveals nothing otherwise */
	resetGroups: [{ id: 'vault', label: '@vault.resetLabel', hint: '@vault.resetHint', order: 85, onReset: () => lock(),
		visible: () => current !== null || kept }],

	terminal: {
		login: { run: login, help: '@vault.cmdLogin', hidden: true, sensitive: true },
		logout: { run: logout, help: '@vault.cmdLogout', hidden: true }
	},

	setup(desk) {
		D = desk;
		cfg = desk.modules.config('vault') ?? cleanConfig(desk.config.vault);
		if (!cfg.salt) console.warn(`[vault] ${EMPTY_SALT_WARNING}`);
		if (!available() && desk.config.debug) console.info('[vault] no WebCrypto here (not a secure context?) — login is unavailable');
		desk.provide('vault', service);
		desk.once('desk:ready', () => {
			resume().catch(e => console.warn('[vault] resume failed:', e));
		});
	}
};
