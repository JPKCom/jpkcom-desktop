/* JPKCom Desktop — Fortune app: optional online sources (pure) — © Jean Pierre Kolb — MIT License

   A remote source is used only when the site names it (config.fortune.remote),
   offers the service (config.services.fortune: true) and the user agrees
   (consent 'fortune'). Its hosts must be in the server's CSP connect-src.

   Provider definition:
     { id, name: text, hosts: ['api.example.org'],       1 to MAX_HOSTS (8) host names
       home: 'https://…' | null,
       langs: ['en', 'de'] | null,                       languages it serves (null: any)
       categories: [{ id, label: text,                   optional; label '@ns.key' or { lang: text }
                      langs?: ['en'] }],                 languages the category exists in (default: all)
       emptyStatus: [400] | [],                          HTTP statuses that mean "nothing found for
                                                         this request" (not an outage)
       url({ cat, lang, block }) → 'https://…',          the request for one text
       parse(json, { plain, lang }) → { text, url?, lang?, cat?, by? } | null }
                                                         null: blocked (the app asks again,
                                                         MAX_TRIES times); throw: unusable answer;
                                                         throw an error with code 'empty': nothing found
   plain(html) turns foreign text into plain text (parsed inert in the browser).

   Added by modules: descriptor contribution fortuneProviders (a plain object literal — own
   properties only) or Desk.fortune.addProvider(def, { module }). createSources() below keeps
   the list, adopts contributions, drops a failed module's providers and registers the consent
   for the configured one.

   Built in:
     jokeapi       JokeAPI v2 (https://jokeapi.dev/), host v2.jokeapi.dev — jokes in
                   cs, de, en, es, fr, pt; safe mode, no offensive flags. Not every category
                   exists in every language (checked 2026-10 with safe mode): a category is only
                   offered where it has jokes; "nothing found" (HTTP 400, error code 106) is
                   shown as an empty category, never as an outage
     uselessfacts  Useless Facts (https://uselessfacts.jsph.pl/), host uselessfacts.jsph.pl —
                   random facts in de and en; "Learn more" opens the fact's origin (source_url,
                   https only), its name (source) is the signature */

import { isCat, isLang, baseLang, isText, MAX_HOSTS } from './model.js';
import { isObj } from '../../core/is.js';

const HOST = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

/* Like the original's BLOCKED list: offensive, political and religious texts stay out —
   also when "All categories" picks one */
const JOKE_FLAGS = ['nsfw', 'religious', 'political', 'racist', 'sexist', 'explicit'];
const JOKE_CATS = { programming: 'Programming', misc: 'Misc', pun: 'Pun', spooky: 'Spooky', christmas: 'Christmas' };
/* The languages each category has safe jokes in (JokeAPI answered 2026-10) */
const JOKE_LANGS = {
	programming: ['en', 'de', 'es'],
	misc: ['en', 'de', 'cs', 'fr', 'pt'],
	pun: ['en', 'de'],
	spooky: ['en'],
	christmas: ['en', 'de']
};
const JOKE_NONE = 106;    // JokeAPI: "No matching joke found"

/** An error that means "nothing found for this request" — the app shows an empty category */
export function emptyAnswer(msg) {
	return Object.assign(new Error(msg), { code: 'empty' });
}

export const jokeapi = Object.freeze({
	id: 'jokeapi',
	name: 'JokeAPI',
	hosts: ['v2.jokeapi.dev'],
	home: 'https://jokeapi.dev/',
	langs: ['en', 'de', 'cs', 'es', 'fr', 'pt'],
	categories: [
		{ id: 'programming', label: '@fortune.catProgramming', langs: JOKE_LANGS.programming },
		{ id: 'misc', label: '@fortune.catMisc', langs: JOKE_LANGS.misc },
		{ id: 'pun', label: '@fortune.catPun', langs: JOKE_LANGS.pun },
		{ id: 'spooky', label: '@fortune.catSpooky', langs: JOKE_LANGS.spooky },
		{ id: 'christmas', label: '@fortune.catChristmas', langs: JOKE_LANGS.christmas }
	],
	/* JokeAPI answers "No matching joke found" with HTTP 400 */
	emptyStatus: [400],
	url({ cat = null, lang = 'en', block = [] } = {}) {
		/* "All" asks for the allowed categories of this language by name
		   (never 'Any', which includes dark humour) */
		const base = baseLang(lang);
		const cats = cat && JOKE_CATS[cat] ? [JOKE_CATS[cat]]
			: Object.entries(JOKE_CATS)
				.filter(([id]) => !block.includes(id) && JOKE_LANGS[id].includes(base))
				.map(([, name]) => name);
		const q = new URLSearchParams({ lang, blacklistFlags: JOKE_FLAGS.join(',') });
		return `https://v2.jokeapi.dev/joke/${encodeURIComponent(cats.join(',') || 'Misc')}?${q}&safe-mode`;
	},
	parse(j, { plain, lang }) {
		if (isObj(j) && j.error === true && j.code === JOKE_NONE) throw emptyAnswer('jokeapi: no matching joke');
		if (!isObj(j) || j.error === true) throw new Error('jokeapi: error answer');
		const flags = isObj(j.flags) ? j.flags : {};
		if (j.safe === false || JOKE_FLAGS.some(f => flags[f] === true)) return null;
		const cat = typeof j.category === 'string' ? j.category.toLowerCase() : null;
		if (cat && !JOKE_CATS[cat]) return null;
		const parts = j.type === 'twopart' ? [j.setup, j.delivery] : [j.joke];
		if (parts.some(p => typeof p !== 'string')) throw new Error('jokeapi: no text');
		const text = parts.map(p => plain(p)).filter(Boolean).join('\n');
		if (!text) throw new Error('jokeapi: empty');
		return { text, url: null, lang: isLang(j.lang) ? j.lang : lang, cat };
	}
});

export const uselessfacts = Object.freeze({
	id: 'uselessfacts',
	name: '@fortune.providerFacts',
	hosts: ['uselessfacts.jsph.pl'],
	home: 'https://uselessfacts.jsph.pl/',
	langs: ['en', 'de'],
	categories: [],
	url: ({ lang = 'en' } = {}) => `https://uselessfacts.jsph.pl/api/v2/facts/random?language=${encodeURIComponent(lang)}`,
	parse(j, { plain, lang }) {
		if (!isObj(j) || typeof j.text !== 'string') throw new Error('uselessfacts: no text');
		const text = plain(j.text);
		if (!text) throw new Error('uselessfacts: empty');
		/* "Learn more" is the fact's origin — the permalink is only the API's JSON */
		return {
			text,
			url: httpsUrl(j.source_url),
			by: typeof j.source === 'string' ? plain(j.source) || null : null,
			lang: isLang(j.language) ? j.language : lang
		};
	}
});

export const BUILT_IN = Object.freeze({ jokeapi, uselessfacts });

/** An absolute https:// address (no credentials) or null */
export function httpsUrl(raw) {
	if (typeof raw !== 'string' || raw.length > 2048) return null;
	try {
		const u = new URL(raw);
		return u.protocol === 'https:' && !u.username && !u.password ? u.href : null;
	} catch {
		return null;
	}
}

/**
 * Checks a provider definition (built-in ones and those added through the
 * service) → a frozen copy or null (reported through warn).
 */
export function cleanProvider(def, warn = () => {}) {
	const bad = msg => {
		warn(`provider ${JSON.stringify(def?.id)}: ${msg} — skipped`);
		return null;
	};
	if (!isObj(def) || !isCat(def.id)) return bad('needs an id [a-z][a-z0-9-]');
	if (!isText(def.name)) return bad('needs a name');
	const hosts = [...new Set((Array.isArray(def.hosts) ? def.hosts : [def.hosts]).filter(x => typeof x === 'string' && HOST.test(x)))];
	if (!hosts.length) return bad('needs its host names (hosts) for the consent and the CSP');
	if (hosts.length > MAX_HOSTS) return bad(`names ${hosts.length} hosts (at most ${MAX_HOSTS})`);
	if (typeof def.url !== 'function' || typeof def.parse !== 'function') return bad('needs url() and parse()');
	const langs = Array.isArray(def.langs) ? def.langs.filter(isLang) : null;
	const categories = (Array.isArray(def.categories) ? def.categories : [])
		.filter(c => isObj(c) && isCat(c.id) && isText(c.label))
		.map(c => {
			const cl = Array.isArray(c.langs) ? c.langs.filter(isLang).map(l => l.toLowerCase()) : [];
			return Object.freeze({ id: c.id, label: c.label, langs: cl.length ? Object.freeze(cl) : null });
		});
	const emptyStatus = (Array.isArray(def.emptyStatus) ? def.emptyStatus : [])
		.filter(n => Number.isInteger(n) && n >= 400 && n < 500);
	return Object.freeze({
		id: def.id, name: def.name, hosts: Object.freeze(hosts),
		home: typeof def.home === 'string' && /^https:\/\//.test(def.home) ? def.home : null,
		langs: langs?.length ? Object.freeze(langs) : null,
		categories: Object.freeze(categories),
		emptyStatus: Object.freeze(emptyStatus),
		url: def.url, parse: def.parse
	});
}

/** The categories a provider offers in one language (those without langs exist in all) */
export function categoriesFor(provider, lang) {
	const base = baseLang(lang);
	return (provider?.categories ?? []).filter(c => !c.langs || c.langs.some(l => baseLang(l) === base));
}

/**
 * A request URL a provider built must go to one of its own hosts over https —
 * a provider cannot send the user anywhere else.
 */
export function checkRequestUrl(provider, raw) {
	let url;
	try {
		url = new URL(raw);
	} catch {
		return null;
	}
	return url.protocol === 'https:' && provider.hosts.includes(url.hostname) ? url.href : null;
}

/* ---------- The consent bound to a provider ---------- */

/** What the user agreed to: '<id>@<sorted hosts>' (stored as agreed in the key 'fortune') */
export const consentTag = p => `${p.id}@${[...p.hosts].sort().join(',')}`;

/**
 * A granted consent that was given for another provider (other id or hosts) or
 * without a record (from before the binding) does not count → true: withdraw it.
 * Without a provider nothing can be requested, so nothing is stale.
 */
export function staleConsent({ granted = false, agreed = null, provider = null } = {}) {
	return !!(granted && provider && agreed !== consentTag(provider));
}

/**
 * What is wrong with the configured online source, reported once at 'modules:ready':
 * remote (config.fortune.remote), local (config.fortune.local), known (a provider has
 * that id), offered (services.fortune: true), builtIn (ids) → messages.
 */
export function remoteProblems({ remote = null, local = true, known = false, offered = false, builtIn = [] } = {}) {
	if (remote && !known) {
		return [`unknown online source '${remote}' (built in: ${builtIn.join(', ')}; a module adds one with fortuneProviders or Desk.fortune.addProvider() in its setup())${local ? '' : ' — the app has nothing to show'}`];
	}
	if (remote && known && !local && !offered) return ['local: false, but services.fortune is not true — the app has nothing to show'];
	return [];
}

/* ---------- The sources and their lifecycle ---------- */

/**
 * The app's online sources and their lifecycle (pure: no DOM, no Desk — index.js wires the bus).
 *   builtIns  provider definitions that are always there (never dropped)
 *   remote()  the configured id (config.fortune.remote), read on every call
 *   consent   { register(provider), unregister() } — the registration for the configured provider
 * → {
 *   add(def, module = null) → provider | null   cleanProvider; duplicate id → warn, null; then sync()
 *   fromContributions(list)                     add(item, item.module) for each, then sync() (also with [])
 *   onLoaded(id, list)                          add() the items with item.module === id
 *   onFailed(id) → ids                          drops the providers added with that module; sync()
 *   ready({ local, offered }) → string[]        remoteProblems() — the first call only, later calls → []
 *   configured() → provider | null              the provider remote() names
 *   get(id), has(id), ids(), builtIn() → ids
 * }
 * A contribution object seen once (fromContributions, then onLoaded with the full list) is
 * adopted once, silently.
 */
export function createSources({ builtIns = [], remote = () => null, consent = null, warn = () => {} } = {}) {
	const list = new Map();          // id → { provider, module }
	const fixed = [];                // the built-in ids
	const seen = new WeakSet();      // contribution objects already handled
	let registered = null;           // the provider the consent is registered for
	let checked = false;

	for (const def of builtIns) {
		const p = cleanProvider(def, warn);
		if (!p || list.has(p.id)) continue;
		list.set(p.id, { provider: p, module: null });
		fixed.push(p.id);
	}

	const configured = () => {
		const id = remote();
		return (typeof id === 'string' && list.get(id)?.provider) || null;
	};

	/* The consent entry follows the configured provider: registered once it exists, withdrawn when it goes */
	function sync() {
		const p = configured();
		if (p === registered) return;
		if (registered) consent?.unregister?.();
		registered = null;
		if (p) {
			consent?.register?.(p);
			registered = p;
		}
	}

	function add(def, module = null) {
		const p = cleanProvider(def, warn);
		if (!p) return null;
		if (list.has(p.id)) {
			warn(`provider '${p.id}' exists already — kept the first`);
			return null;
		}
		list.set(p.id, { provider: p, module: typeof module === 'string' ? module : null });
		sync();
		return p;
	}

	function adopt(item) {
		if (item && typeof item === 'object') {
			if (seen.has(item)) return;
			seen.add(item);
		}
		add(item, item?.module);
	}

	return Object.freeze({
		add,
		fromContributions(items) {
			for (const item of Array.isArray(items) ? items : []) adopt(item);
			sync();
		},
		onLoaded(id, items) {
			if (typeof id !== 'string') return;
			for (const item of Array.isArray(items) ? items : []) if (item?.module === id) adopt(item);
		},
		onFailed(id) {
			const gone = [];
			if (typeof id !== 'string') return gone;
			for (const [pid, entry] of list) {
				if (entry.module === id) {
					list.delete(pid);
					gone.push(pid);
				}
			}
			sync();
			return gone;
		},
		ready({ local = true, offered = false } = {}) {
			if (checked) return [];
			checked = true;
			return remoteProblems({ remote: remote(), local, known: !!configured(), offered, builtIn: [...fixed] });
		},
		configured,
		get: id => list.get(id)?.provider ?? null,
		has: id => list.has(id),
		ids: () => [...list.keys()],
		builtIn: () => [...fixed]
	});
}
