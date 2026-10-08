/* JPKCom Desktop — Fortune app: tips, shortcuts and a little wit, one at a time — © Jean Pierre Kolb — MIT License

   Port of the original joke app, rebuilt around local data:

   - Built-in sayings from <config.fortune.dir><lang>.json (same origin, no consent;
     the language's file, else the next one of the fallback chain — only languages
     listed in config.fortune.langs are fetched, so a language without a file causes
     no 404). Format: model.js.
   - An optional online source (providers.js): only when the site names one
     (config.fortune.remote), offers the service (config.services.fortune) and the
     user agrees — the question stands in the window before anything is fetched,
     as in the original; "Online services" in the settings takes it back.
     Requests go through Desk.net with service 'fortune' (no cookies, no referrer,
     timeout); foreign text is parsed inert and set as plain text.
   - Category filter (config.fortune.block leaves categories out — locally and
     remotely, like the original's blocked list), a history of 20 with forward
     and back, copy, "learn more" for entries with a link.
   - Keyboard: Space, N or → next (forward through the history first), ← previous
     (mirrored right-to-left), Ctrl/⌘+C without a text selection copies.

   Storage key 'fortune' ({ source }, reset group settings); the consent is the
   core's 'consent-fortune'. Service 'fortune': random({ cat }), addProvider(def),
   providers(), source(). Terminal (contribution 'terminal'): `fortune` prints a
   built-in saying, like the classic command — only while this module is loaded.

   This file is the descriptor (config, sources, consent, service, terminal);
   the window is window.js, loaded when it first opens (app field load,
   windowStyles). */

import Desk from '../../core/api.js';
import { cleanFortunes, cleanBlock, cleanLangs, fetchCodes, DEFAULT_LANGS, createDeck, cleanState, isCat } from './model.js';
import { BUILT_IN, cleanProvider } from './providers.js';

const { t, i18n, store } = Desk;
export const KEY = 'fortune';
export const SERVICE = 'fortune';
export const TIMEOUT_MS = 8000;
const DEFAULT_DIR = 'site/data/fortunes/';

export const warn = msg => console.warn(`[fortune] ${msg}`);

/* ---------- Configuration and sources ---------- */

export const cfg = () => Desk.modules.config('fortune') ?? { remote: null, dir: DEFAULT_DIR, langs: DEFAULT_LANGS, block: [] };

const providers = new Map(Object.values(BUILT_IN).map(p => [p.id, cleanProvider(p, warn)]));
let consentFor = null;   // the provider the consent service was registered for

/** The online source when the site offers it (named, known, services.fortune: true) */
export function remoteProvider() {
	const id = cfg().remote;
	const p = id ? providers.get(id) : null;
	return p && Desk.consent.enabled(SERVICE) ? p : null;
}

/* The consent entry (Settings → Online services) carries the provider's hosts */
function registerConsent() {
	const p = cfg().remote ? providers.get(cfg().remote) : null;
	if (!p || consentFor) return;
	consentFor = p.id;
	Desk.consent.register({ id: SERVICE, hosts: [...p.hosts], label: '@fortune.service', hint: '@fortune.serviceHint' }, 'fortune');
}

const loadState = () => store.getJson(KEY, cleanState, null);

/* Without a choice the online source comes first when the site offers it (as the original, which had only that) */
export const storedSource = () => loadState()?.source ?? (remoteProvider() ? 'remote' : 'local');

export function saveSource(source) {
	if (!store.setJson(KEY, { source })) Desk.announce(t('core.storageFull'), { assertive: true });
}

/* ---------- Built-in sayings ---------- */

const localCache = new Map();   // first code of the chain → Promise<{ code, data, deck } | null>

/** The sayings for the current language: its file, else the next one of the fallback chain */
export function localData(lang = Desk.lang()) {
	if (localCache.has(lang)) return localCache.get(lang);
	const p = (async () => {
		/* only languages the site has a file for (null: try each) — no 404 for the others */
		for (const code of fetchCodes(i18n.chain(lang), cfg().langs)) {
			let json;
			try {
				json = await Desk.net.getJson(Desk.env.asset(`${cfg().dir}${code}.json`), { timeout: TIMEOUT_MS });
			} catch (err) {
				if (err?.code !== 'http') warn(`${code}.json: ${err?.message ?? err}`);
				continue;
			}
			const data = cleanFortunes(json, { code, block: cfg().block, warn: msg => warn(`${code}.json: ${msg}`) });
			if (data) return { code: data.lang ?? code, data, deck: createDeck(data.items) };
		}
		return null;
	})();
	localCache.set(lang, p);
	/* a failed load may be retried later (offline, deploy in progress) */
	p.then(r => { if (!r) localCache.delete(lang); });
	return p;
}

export async function drawLocal(cat) {
	const d = await localData();
	if (!d) throw new Error('no sayings');
	const known = cat && d.data.categories.some(c => c.id === cat);
	const item = d.deck.draw(known ? cat : null);
	return item ? { ...item, lang: d.code, source: 'local' } : null;
}

/* ---------- Service ---------- */

const service = Object.freeze({
	/** A built-in saying in the current language → { text, lang, cat, by, url } | null */
	async random({ cat = null } = {}) {
		try {
			return await drawLocal(isCat(cat) ? cat : null);
		} catch {
			return null;
		}
	},
	/** Adds an online source (definition: providers.js). The site picks it with config.fortune.remote. */
	addProvider(def) {
		const p = cleanProvider(def, warn);
		if (!p) return false;
		if (providers.has(p.id)) {
			warn(`provider '${p.id}' exists already — kept the first`);
			return false;
		}
		providers.set(p.id, p);
		registerConsent();
		Desk.refreshMenus();
		return true;
	},
	providers: () => [...providers.keys()],
	/** 'local' or 'remote' — the source the app uses now */
	source: () => (storedSource() === 'remote' && remoteProvider() ? 'remote' : 'local')
});

/* ---------- Terminal command ---------- */

/* `fortune`: a built-in saying and its signature (never the online source — the terminal asks no consent).
   io (the terminal, P9): say(text, cls?), err(text)?, dim(text)? */
async function fortuneCommand(args, io) {
	const item = await service.random();
	if (!item?.text) {
		if (typeof io.err === 'function') io.err(t('fortune.localError'));
		else io.say?.(t('fortune.localError'), 'term-error');
		return;
	}
	for (const line of String(item.text).split('\n')) io.say?.(line);
	if (!item.by) return;
	const by = t('fortune.by', { name: item.by });
	if (typeof io.dim === 'function') io.dim(by);
	else io.say?.(by, 'term-dim');
}

/* ---------- Descriptor ---------- */

export default {
	id: 'fortune',
	kind: 'app',
	i18n: ['fortune'],
	windowStyles: ['fortune.css'],

	app: {
		icon: 'ti-cookie', tint: 'orange', size: [540, 460], name: '@fortune.appName', desc: '@fortune.appDesc',
		load: () => import('./window.js')
	},

	storage: {
		fortune: { type: 'json', backup: true, reset: 'settings', label: '@fortune.storageLabel', validate: cleanState }
	},

	/* config.fortune: { remote: provider id | null, dir: folder of <lang>.json,
	   langs: [codes with a file] | null (try every code), block: [category ids] } */
	terminal: {
		fortune: { run: fortuneCommand, help: '@fortune.cmd', man: '@fortune.cmdMan' }
	},

	configKey: 'fortune',
	validateConfig(section, warnCfg) {
		const s = section && typeof section === 'object' ? section : {};
		let remote = null;
		if (s.remote != null) {
			if (isCat(s.remote)) remote = s.remote;
			else warnCfg(`remote must be a provider id (${Object.keys(BUILT_IN).join(', ')}) or null — no online source`);
		}
		const dir = typeof s.dir === 'string' && s.dir.endsWith('/') ? s.dir : DEFAULT_DIR;
		return { remote, dir, langs: cleanLangs(s.langs, warnCfg), block: cleanBlock(s.block, warnCfg) };
	},

	setup(desk) {
		const id = cfg().remote;
		if (id && !providers.has(id)) {
			/* a site module may still add it through the service */
			warn(`unknown online source '${id}' (built in: ${Object.keys(BUILT_IN).join(', ')})`);
		}
		registerConsent();
		desk.provide('fortune', service);
	}
};
