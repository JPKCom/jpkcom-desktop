/* JPKCom Desktop — vault core: key derivation, sealed file format, content check — © Jean Pierre Kolb — MIT License

   Private bookmarks, encrypted. User name and password become, through
   PBKDF2-HMAC-SHA-256, 512 bits: the first 256 are the AES-256-GCM key, the
   next 128 name the file (<config.vault.dir><32 hex>.bin). Wrong credentials →
   a file that does not exist. AES-256 keeps 128 bits of strength against
   Grover's algorithm, so the weakest link is the password, not the cipher.

   The salt and the iteration count come from config.vault (one salt of its own
   per deployment — an empty salt falls back to a public default and is warned
   about loudly). Changing either renames every file: reseal afterwards.

   File format, version 2 (written by tools/seal-vault.mjs):
     "JPKV" · version 2 · KDF id (1 = PBKDF2-HMAC-SHA-256) · iterations (uint32, big endian)
     · salt length (1 byte) · salt (UTF-8) · IV (12 bytes) · ciphertext + GCM tag (16 bytes)
   The whole header is authenticated as additional data, so the file describes
   the parameters it was sealed with and nobody can change them unnoticed.
   Version 1 (the original desktop: "JPKV" · 1 · IV · ciphertext, fixed salt
   'jpkcom-desktop-vault/v1', 600 000 iterations) is still read.

   Pure: no DOM, no Desk API — the browser module (index.js), the sealing tool
   (tools/seal-vault.mjs) and the Node tests share this one file, so they
   cannot drift apart. Needs WebCrypto (globalThis.crypto.subtle: a secure
   context in the browser, Node ≥ 19). */

export const MAGIC = Object.freeze([0x4a, 0x50, 0x4b, 0x56]);   // "JPKV"
export const VERSION = 2;
export const KDF_PBKDF2_SHA256 = 1;
/** The original desktop's salt — used when config.vault.salt is empty (and then warned about) */
export const DEFAULT_SALT = 'jpkcom-desktop-vault/v1';
/** OWASP recommendation for PBKDF2-HMAC-SHA-256 */
export const DEFAULT_ITERATIONS = 600000;
export const MIN_ITERATIONS = 10000;
export const MAX_ITERATIONS = 10000000;
export const MAX_SALT_BYTES = 255;
/** Prefix of the item apps when the vault has to create its collection itself (link-<slug>, as in the original) */
export const DEFAULT_PREFIX = 'link';
export const DEFAULT_ICON = 'ti-bookmark';
export const DEFAULT_TINT = 'slate';
export const MAX_GROUPS = 20;
export const MAX_ITEMS = 500;

const IV = 12;
const TAG = 16;
const V1_HEAD = MAGIC.length + 1;
const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const FILE = /^[0-9a-f]{32}$/;
const LANG = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i;
const HEX = /^#[0-9a-f]{6}$/i;

const enc = new TextEncoder();
const subtle = () => globalThis.crypto?.subtle ?? null;
const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');

/** WebCrypto present? (false on http:// pages other than localhost and in very old browsers) */
export const supported = () => subtle() !== null;

/** Is this a file id derive() can produce (32 lower-case hex digits)? */
export const isFileId = v => typeof v === 'string' && FILE.test(v);

/** File name of a sealed vault: '<32 hex>.bin' */
export const fileName = file => `${file}.bin`;

/* The user name ignores case and surrounding spaces, the password nothing.
   JSON keeps the two apart ("ab" + "c" ≠ "a" + "bc"). */
export const normUser = user => String(user ?? '').normalize('NFC').trim().toLowerCase();

/** The salt actually used: config.vault.salt, or the public default when it is empty */
export const effectiveSalt = salt => (typeof salt === 'string' && salt !== '' ? salt : DEFAULT_SALT);

/**
 * Derives key and file name from the credentials.
 *   opts: { salt, iterations, usages = ['decrypt'] }
 * → { key: CryptoKey (AES-GCM, not extractable), file: '<32 hex>', user: normalised name }
 */
export async function derive(user, pass, { salt = '', iterations = DEFAULT_ITERATIONS, usages = ['decrypt'] } = {}) {
	const crypto = subtle();
	if (!crypto) throw new Error('vault: WebCrypto is not available');
	if (!Number.isInteger(iterations) || iterations < 1) throw new Error('vault: invalid iteration count');
	const material = enc.encode(JSON.stringify([normUser(user), String(pass ?? '').normalize('NFC')]));
	const bits = new Uint8Array(32 + 16 + 16);
	try {
		const base = await crypto.importKey('raw', material, 'PBKDF2', false, ['deriveBits']);
		bits.set(new Uint8Array(await crypto.deriveBits(
			{ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(effectiveSalt(salt)), iterations }, base, 512)));
		/* Not extractable: it can decrypt, but nobody can read it back out (also not from IndexedDB) */
		const key = await crypto.importKey('raw', bits.subarray(0, 32), { name: 'AES-GCM' }, false, usages);
		return { key, file: hex(bits.subarray(32, 48)), user: normUser(user) };
	} finally {
		material.fill(0);
		bits.fill(0);
	}
}

/** The version 2 header for these parameters */
export function header({ salt = '', iterations = DEFAULT_ITERATIONS } = {}) {
	const s = enc.encode(effectiveSalt(salt));
	if (s.length > MAX_SALT_BYTES) throw new Error(`vault: the salt may have at most ${MAX_SALT_BYTES} bytes`);
	if (!Number.isInteger(iterations) || iterations < 1 || iterations > 0xffffffff) throw new Error('vault: invalid iteration count');
	const head = new Uint8Array(MAGIC.length + 7 + s.length);
	head.set(MAGIC);
	head[4] = VERSION;
	head[5] = KDF_PBKDF2_SHA256;
	new DataView(head.buffer).setUint32(6, iterations);
	head[10] = s.length;
	head.set(s, 11);
	return head;
}

/**
 * Reads the header of a sealed file without decrypting it.
 * → { version, kdf, iterations, salt, size } (size = header bytes) or null for a foreign file.
 * Version 1 files report the original's fixed parameters.
 */
export function readHeader(data) {
	const bytes = data instanceof Uint8Array ? data : new Uint8Array(data ?? []);
	if (bytes.length < V1_HEAD || MAGIC.some((b, i) => bytes[i] !== b)) return null;
	const version = bytes[MAGIC.length];
	if (version === 1) {
		if (bytes.length < V1_HEAD + IV + TAG) return null;
		return { version, kdf: KDF_PBKDF2_SHA256, iterations: DEFAULT_ITERATIONS, salt: DEFAULT_SALT, size: V1_HEAD };
	}
	if (version !== 2 || bytes.length < 11) return null;
	const kdf = bytes[5];
	const iterations = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(6);
	const size = 11 + bytes[10];
	if (bytes.length < size + IV + TAG) return null;
	let salt;
	try {
		salt = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(11, size));
	} catch {
		return null;
	}
	return { version, kdf, iterations, salt, size };
}

/** True when a header matches the parameters of a deployment (config.vault salt + iterations) */
export const sameParams = (head, { salt = '', iterations = DEFAULT_ITERATIONS } = {}) =>
	!!head && head.kdf === KDF_PBKDF2_SHA256 && head.iterations === iterations && head.salt === effectiveSalt(salt);

/**
 * Encrypts a JSON value → Uint8Array (format version 2).
 *   params: { salt, iterations } — the ones the key was derived with (they go into the header)
 */
export async function seal(key, value, params = {}) {
	const crypto = subtle();
	if (!crypto) throw new Error('vault: WebCrypto is not available');
	const head = header(params);
	const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV));
	const body = new Uint8Array(await crypto.encrypt({ name: 'AES-GCM', iv, additionalData: head }, key, enc.encode(JSON.stringify(value))));
	const out = new Uint8Array(head.length + IV + body.length);
	out.set(head);
	out.set(iv, head.length);
	out.set(body, head.length + IV);
	return out;
}

/**
 * Decrypts a sealed file → the JSON value.
 * Throws on a foreign file, other KDF parameters than expected (when given),
 * a wrong key or any changed byte (GCM tag).
 *   expect: { salt, iterations } of this deployment (optional)
 */
export async function open(key, data, expect = null) {
	const crypto = subtle();
	if (!crypto) throw new Error('vault: WebCrypto is not available');
	const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
	const head = readHeader(bytes);
	if (!head) throw new Error('vault: unknown format');
	if (head.kdf !== KDF_PBKDF2_SHA256) throw new Error('vault: unknown key derivation');
	if (expect && !sameParams(head, expect)) throw new Error('vault: sealed with other parameters (salt or iterations)');
	const plain = await crypto.decrypt(
		{ name: 'AES-GCM', iv: bytes.subarray(head.size, head.size + IV), additionalData: bytes.subarray(0, head.size) },
		key, bytes.subarray(head.size + IV));
	const view = new Uint8Array(plain);
	try {
		return JSON.parse(new TextDecoder().decode(view));
	} finally {
		view.fill(0);
	}
}

/* ---------- Configuration (descriptor validateConfig) ---------- */

/**
 * Cleans config.vault (a writable copy): salt, iterations, and again dir,
 * collection and maxBytes (the core already checks those three).
 * warn(msg) reports what was replaced.
 */
export function cleanConfig(section, warn = () => {}) {
	const src = section && typeof section === 'object' && !Array.isArray(section) ? section : {};
	const out = { salt: '', iterations: DEFAULT_ITERATIONS, dir: 'site/vault/', collection: 'bookmarks', maxBytes: 1048576 };
	if (typeof src.salt === 'string' && enc.encode(src.salt).length <= MAX_SALT_BYTES) out.salt = src.salt;
	else if (src.salt != null && src.salt !== '') warn(`salt must be a string of at most ${MAX_SALT_BYTES} bytes — the public default is used`);
	if (Number.isInteger(src.iterations) && src.iterations >= MIN_ITERATIONS && src.iterations <= MAX_ITERATIONS) {
		out.iterations = src.iterations;
		if (src.iterations < DEFAULT_ITERATIONS) warn(`iterations ${src.iterations} is below the recommended ${DEFAULT_ITERATIONS}`);
	} else if (src.iterations != null) {
		warn(`iterations must be an integer between ${MIN_ITERATIONS} and ${MAX_ITERATIONS} — ${DEFAULT_ITERATIONS} is used`);
	}
	if (typeof src.dir === 'string' && /^(?![a-z][a-z0-9+.-]*:)(?!\/\/)(?!.*\.\.)[^\s?#\\]*\/$/i.test(src.dir)) out.dir = src.dir;
	else if (src.dir != null) warn('dir must be a same-origin folder ending in "/" — site/vault/ is used');
	if (typeof src.collection === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(src.collection)) out.collection = src.collection;
	else if (src.collection != null) warn('collection must be a collection id — bookmarks is used');
	if (Number.isInteger(src.maxBytes) && src.maxBytes > 0) out.maxBytes = src.maxBytes;
	else if (src.maxBytes != null) warn('maxBytes must be a positive integer — 1048576 is used');
	return out;
}

/** The loud warning for a deployment without a salt of its own (browser console and sealing tool) */
export const EMPTY_SALT_WARNING = 'config.vault.salt is empty: this deployment uses the public default salt, which every '
	+ 'deployment without a salt of its own shares — precomputed password guesses work against all of them at once. '
	+ 'Set a random salt of your own (node tools/seal-vault.mjs --new-salt) and reseal.';

/* ---------- Content: groups and items of a collection ---------- */

/**
 * A label: a non-empty string, or a { lang: text } map (any number of languages;
 * entries that are not texts are dropped). → string | object | null
 */
export function cleanText(v, max = 160) {
	const ok = s => typeof s === 'string' && s.trim() !== '' && s.length <= max;
	if (ok(v)) return v.trim();
	if (v && typeof v === 'object' && !Array.isArray(v)) {
		const out = {};
		for (const [lang, s] of Object.entries(v)) if (LANG.test(lang) && ok(s)) out[lang] = s.trim();
		return Object.keys(out).length ? out : null;
	}
	return null;
}

/**
 * Checks what a vault holds against the manifest. Entries that cannot work are
 * dropped, a missing icon falls back to the group's; every finding lands in
 * `problems` — the sealing tool refuses to seal while there are any, the
 * browser drops silently what it cannot use.
 *
 * data: { groups: [{ id, name, desc?, icon?, tint? }], items: [{ slug, group, name, url, desc?, icon? }] }
 *       (the original's { linkCategories: [...], links: [{ …, cat }] } is read as well)
 * opts: {
 *   taken: { groups: Set, slugs: Set }   ids of the collection that already exist (the vault never replaces them)
 *   icons(id) → boolean                  is the icon id known?
 *   tints(name) → boolean                is the tint name known? (pairs ['#top', '#bottom'] always pass)
 * }
 * → { groups, items, problems: string[] }
 */
export function clean(data, { taken = {}, icons = () => true, tints = () => true } = {}) {
	const takenGroups = taken.groups ?? new Set();
	const takenSlugs = taken.slugs ?? new Set();
	const legacy = !Array.isArray(data?.groups) && !Array.isArray(data?.items)
		&& (Array.isArray(data?.linkCategories) || Array.isArray(data?.links));
	const G = legacy ? 'linkCategories' : 'groups';
	const I = legacy ? 'links' : 'items';
	const GF = legacy ? 'cat' : 'group';
	const rawGroups = Array.isArray(data?.[G]) ? data[G] : [];
	const rawItems = Array.isArray(data?.[I]) ? data[I] : [];

	const problems = [];
	const groups = [];
	const items = [];
	const own = new Set();
	const slugs = new Set();
	const iconOf = (v, fallback, where) => {
		if (v == null) return fallback;
		if (typeof v === 'string' && icons(v)) return v;
		problems.push(`${where}: icon ${JSON.stringify(v)} is not known`);
		return fallback;
	};
	const tintOf = (v, where) => {
		if (v == null) return DEFAULT_TINT;
		if (typeof v === 'string' && tints(v)) return v;
		if (Array.isArray(v) && v.length === 2 && v.every(c => typeof c === 'string' && HEX.test(c))) return [...v];
		problems.push(`${where}: unknown tint ${JSON.stringify(v)}`);
		return DEFAULT_TINT;
	};

	for (const [i, g] of rawGroups.slice(0, MAX_GROUPS).entries()) {
		const where = `${G}[${i}]`;
		const name = cleanText(g?.name, 60);
		if (typeof g?.id !== 'string' || !ID.test(g.id) || !name) {
			problems.push(`${where}: needs id (a-z, 0-9, -) and name`);
			continue;
		}
		if (takenGroups.has(g.id) || own.has(g.id)) {
			problems.push(`${where}: id "${g.id}" is already taken`);
			continue;
		}
		own.add(g.id);
		const group = { id: g.id, name, icon: iconOf(g.icon, DEFAULT_ICON, where), tint: tintOf(g.tint, where) };
		if (g.desc != null) {
			const desc = cleanText(g.desc);
			if (desc) group.desc = desc;
			else problems.push(`${where}: desc is not a text`);
		}
		groups.push(group);
	}
	if (!groups.length) problems.push(`${G}: none usable`);

	for (const [i, x] of rawItems.slice(0, MAX_ITEMS).entries()) {
		const where = `${I}[${i}]${typeof x?.slug === 'string' ? ` (${x.slug})` : ''}`;
		const name = cleanText(x?.name, 80);
		const group = groups.find(g => g.id === x?.[GF]);
		let url = null;
		try {
			url = new URL(x?.url);
		} catch { /* checked below */ }
		if (typeof x?.slug !== 'string' || !ID.test(x.slug) || !name) {
			problems.push(`${where}: needs slug (a-z, 0-9, -) and name`);
			continue;
		}
		if (takenSlugs.has(x.slug) || slugs.has(x.slug)) {
			problems.push(`${where}: slug is already taken`);
			continue;
		}
		if (!group) {
			problems.push(`${where}: ${GF} must be one of the vault's own ${G}`);
			continue;
		}
		/* Intranets often have no certificate, so http:// passes here (unlike public collections) */
		if (!url || !/^https?:$/.test(url.protocol) || url.username || url.password) {
			problems.push(`${where}: url must be http(s):// without credentials`);
			continue;
		}
		slugs.add(x.slug);
		const item = { slug: x.slug, group: group.id, name, url: url.href, icon: iconOf(x.icon, group.icon, where) };
		if (x.desc != null && x.desc !== '') {
			const desc = cleanText(x.desc);
			if (desc) item.desc = desc;
			else problems.push(`${where}: desc is not a text`);
		}
		items.push(item);
	}
	/* A group without items stays in the plain text for later, but not on the desktop */
	const used = new Set(items.map(x => x.group));
	groups.splice(0, groups.length, ...groups.filter(g => used.has(g.id)));
	if (rawItems.length > MAX_ITEMS || rawGroups.length > MAX_GROUPS) problems.push(`at most ${MAX_GROUPS} groups and ${MAX_ITEMS} items`);

	return { groups, items, problems };
}

/**
 * Collection items (site manifest format, §7) for registry.extendCollection():
 * external links that never enter the dock (the pins live in localStorage and the backup).
 */
export const toCollectionItems = items => items.map(x => ({
	slug: x.slug, group: x.group, name: x.name, url: x.url, icon: x.icon, kind: 'link',
	nodock: true, allowHttp: x.url.startsWith('http:'), vault: true,
	...(x.desc ? { desc: x.desc } : {})
}));

/** The collection the vault creates when the site has none of that id (config.vault.collection) */
export const collectionDef = (id, name) => ({
	id, prefix: DEFAULT_PREFIX, app: id, name, icon: 'ti-bookmarks', tint: 'indigo',
	itemKind: 'link', allowHttp: true, sort: 'alpha'
});

/**
 * Ids a vault may not use in a collection: its groups and every app id
 * '<prefix>-<slug>' that exists already. apps: [{ id }] (all apps).
 */
export function takenIds(collection, apps, prefix = collection?.prefix ?? DEFAULT_PREFIX) {
	const groups = new Set((collection?.groups ?? []).map(g => g.id));
	const head = `${prefix}-`;
	const slugs = new Set(apps.filter(a => typeof a?.id === 'string' && a.id.startsWith(head)).map(a => a.id.slice(head.length)));
	return { groups, slugs };
}
