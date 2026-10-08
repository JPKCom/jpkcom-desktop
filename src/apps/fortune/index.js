/* JPKCom Desktop — Fortune app: tips, shortcuts and a little wit, one at a time — © Jean Pierre Kolb — MIT License

   Port of the original joke app, rebuilt around local data:

   - Built-in sayings from <config.fortune.dir><lang>.json (same origin, no consent;
     the language's file, else the next one of the fallback chain — only languages
     listed in config.fortune.langs are fetched, so a language without a file causes
     no 404). Format: model.js. config.fortune.local: false drops them (online only:
     nothing is fetched from dir, the terminal command is hidden).
   - An optional online source (providers.js): only when the site names one
     (config.fortune.remote), offers the service (config.services.fortune) and the
     user agrees — the question stands in the window before anything is fetched,
     as in the original; "Online services" in the settings takes it back.
     Requests go through Desk.net with service 'fortune' (no cookies, no referrer,
     timeout); foreign text is parsed inert and set as plain text.
     Providers come built in, from modules (descriptor contribution
     fortuneProviders, adopted in setup() and on 'module:loaded') or through
     Desk.fortune.addProvider(def, { module }). The lifecycle is createSources()
     (providers.js); an unknown remote is reported once, at 'modules:ready'.
   - The agreement is bound to the provider: the key 'fortune' records
     agreed: '<id>@<hosts>'; at 'modules:ready' a consent given for another
     provider (or without a record) is withdrawn, so the question comes again.
   - config.fortune.texts replaces the texts that name the app (appText(),
     keys: model.js TEXT_KEYS) — e.g. after the site renamed it.
   - Category filter (config.fortune.block leaves categories out — locally and
     remotely, like the original's blocked list), a history of 20 with forward
     and back, copy, "learn more" for entries with a link.
   - Keyboard: Space, N or → next (forward through the history first), ← previous
     (mirrored right-to-left), Ctrl/⌘+C without a text selection copies.

   Storage key 'fortune' ({ source, agreed }, reset group settings); the consent is
   the core's 'consent-fortune'. Service 'fortune': random({ cat }),
   addProvider(def, { module }), providers(), source(). Terminal (contribution
   'terminal'): `fortune` prints a built-in saying, like the classic command —
   only while this module is loaded and the site keeps the built-in sayings.

   This file is the descriptor (config, sources, consent, service, terminal);
   the window is window.js, loaded when it first opens (app field load,
   windowStyles). */

import Desk from '../../core/api.js';
import {
	cleanFortunes, cleanBlock, cleanLangs, fetchCodes, DEFAULT_LANGS, createDeck, cleanState, isCat,
	cleanLocal, cleanTexts, sourceFor
} from './model.js';
import { BUILT_IN, createSources, consentTag, staleConsent } from './providers.js';

const { t, L, i18n, store } = Desk;
export const KEY = 'fortune';
export const SERVICE = 'fortune';
export const TIMEOUT_MS = 8000;
const DEFAULT_DIR = 'site/data/fortunes/';

export const warn = msg => console.warn(`[fortune] ${msg}`);

/* ---------- Configuration and sources ---------- */

export const cfg = () => Desk.modules.config('fortune')
	?? { remote: null, local: true, dir: DEFAULT_DIR, langs: DEFAULT_LANGS, block: [], texts: {} };

/** An app text: the site's (config.fortune.texts[key]) or fortune.<key> — keys: model.js TEXT_KEYS */
export const appText = key => {
	const v = cfg().texts?.[key];
	return v != null ? L(v) : t(`fortune.${key}`);
};

const sources = createSources({
	builtIns: Object.values(BUILT_IN),
	remote: () => cfg().remote,
	consent: {
		/* The consent entry (Settings → Online services) carries the provider's hosts */
		register: p => Desk.consent.register({
			id: SERVICE, hosts: [...p.hosts],
			label: cfg().texts?.service ?? '@fortune.service', hint: cfg().texts?.serviceHint ?? '@fortune.serviceHint'
		}, 'fortune'),
		unregister: () => Desk.consent.unregister(SERVICE)
	},
	warn
});

/** The online source when the site offers it (named, known, services.fortune: true) */
export function remoteProvider() {
	const p = sources.configured();
	return p && Desk.consent.enabled(SERVICE) ? p : null;
}

const loadState = () => store.getJson(KEY, cleanState, null);

function saveState(patch) {
	if (!store.setJson(KEY, { ...(loadState() ?? {}), ...patch })) Desk.announce(t('core.storageFull'), { assertive: true });
}

/* Without a choice the online source comes first when the site offers it (as the original, which had only that);
   online only (local: false) → 'remote' or null (no usable source) */
export const storedSource = () => sourceFor({
	stored: loadState()?.source ?? (remoteProvider() ? 'remote' : 'local'),
	local: cfg().local !== false,
	remote: !!remoteProvider()
});

/** Remembers the source choice (nothing to choose online only) */
export function saveSource(source) {
	if (cfg().local === false) return;
	saveState({ source });
}

/* The user agreed: remember to which provider (id and hosts) */
function recordAgreement() {
	const p = sources.configured();
	if (p && Desk.consent.granted(SERVICE)) saveState({ agreed: consentTag(p) });
}

/* An agreement for another provider (or from before the binding) does not count */
function checkAgreement() {
	if (staleConsent({ granted: Desk.consent.granted(SERVICE), agreed: loadState()?.agreed ?? null, provider: sources.configured() })) {
		Desk.consent.set(SERVICE, false);
	}
}

/* ---------- Built-in sayings ---------- */

const localCache = new Map();   // first code of the chain → Promise<{ code, data, deck } | null>

/** The sayings for the current language: its file, else the next one of the fallback chain (null online only) */
export function localData(lang = Desk.lang()) {
	if (cfg().local === false) return Promise.resolve(null);
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
	/** A built-in saying in the current language → { text, lang, cat, by, url } | null (null online only) */
	async random({ cat = null } = {}) {
		if (cfg().local === false) return null;
		try {
			return await drawLocal(isCat(cat) ? cat : null);
		} catch {
			return null;
		}
	},
	/**
	 * Adds an online source (definition: providers.js). The site picks it with config.fortune.remote.
	 * module: the adding module's own id — the provider goes again on its 'module:failed'.
	 */
	addProvider(def, { module = null } = {}) {
		const ok = !!sources.add(def, typeof module === 'string' ? module : null);
		if (ok) Desk.refreshMenus();
		return ok;
	},
	providers: () => sources.ids(),
	/** 'local' or 'remote' — the source the app uses now; null online only without a usable source */
	source: () => storedSource()
});

/* ---------- Terminal command ---------- */

/* `fortune`: a built-in saying and its signature (never the online source — the terminal asks no consent).
   io (the terminal, P9): say(text, cls?), err(text)?, dim(text)? */
async function fortuneCommand(args, io) {
	const item = await service.random();
	if (!item?.text) {
		if (typeof io.err === 'function') io.err(appText('localError'));
		else io.say?.(appText('localError'), 'term-error');
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

	/* help and man are app texts (config.fortune.texts); hidden online only */
	terminal: {
		fortune: { run: fortuneCommand, help: () => appText('cmd'), man: () => appText('cmdMan'), when: () => cfg().local !== false }
	},

	/* config.fortune: { remote: provider id | null, local: boolean (false: online only, needs remote),
	   dir: folder of <lang>.json, langs: [codes with a file] | null (try every code), block: [category ids],
	   texts: { key: text } (model.js TEXT_KEYS) } */
	configKey: 'fortune',
	validateConfig(section, warnCfg) {
		const s = section && typeof section === 'object' ? section : {};
		let remote = null;
		if (s.remote != null) {
			if (isCat(s.remote)) remote = s.remote;
			else warnCfg(`remote must be a provider id (${Object.keys(BUILT_IN).join(', ')}) or null — no online source`);
		}
		let local = cleanLocal(s.local, warnCfg);
		if (!local && !remote) {
			warnCfg('local: false needs an online source (remote) — built-in sayings used');
			local = true;
		}
		const dir = typeof s.dir === 'string' && s.dir.endsWith('/') ? s.dir : DEFAULT_DIR;
		return { remote, local, dir, langs: cleanLangs(s.langs, warnCfg), block: cleanBlock(s.block, warnCfg), texts: cleanTexts(s.texts, warnCfg) };
	},

	setup(desk) {
		/* providers of modules set up before this app (and the consent for a configured built-in one) … */
		sources.fromContributions(desk.modules.contributions('fortuneProviders'));
		/* … and of those that come later; a failed module takes the providers it added */
		desk.on('module:loaded', ({ id } = {}) => sources.onLoaded(id, desk.modules.contributions('fortuneProviders')));
		desk.on('module:failed', ({ id } = {}) => sources.onFailed(id));
		desk.on('consent:change', ({ id } = {}) => {
			if (id === SERVICE) recordAgreement();
		});
		/* every module is set up: report an unknown source once, check the agreement */
		desk.once('modules:ready', () => {
			for (const m of sources.ready({ local: cfg().local !== false, offered: Desk.consent.enabled(SERVICE) })) warn(m);
			checkAgreement();
		});
		desk.provide('fortune', service);
	}
};
