/* JPKCom Desktop — Fortune app: optional online sources (pure) — © Jean Pierre Kolb — MIT License

   A remote source is used only when the site names it (config.fortune.remote),
   offers the service (config.services.fortune: true) and the user agrees
   (consent 'fortune'). Its hosts must be in the server's CSP connect-src.

   Provider definition:
     { id, name: text, hosts: ['api.example.org'], home: 'https://…' | null,
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

   Built in:
     jokeapi       JokeAPI v2 (https://jokeapi.dev/), host v2.jokeapi.dev — jokes in
                   cs, de, en, es, fr, pt; safe mode, no offensive flags. Not every category
                   exists in every language (checked 2026-10 with safe mode): a category is only
                   offered where it has jokes; "nothing found" (HTTP 400, error code 106) is
                   shown as an empty category, never as an outage
     uselessfacts  Useless Facts (https://uselessfacts.jsph.pl/), host uselessfacts.jsph.pl —
                   random facts in de and en; "Learn more" opens the fact's origin (source_url,
                   https only), its name (source) is the signature */

import { isCat, isLang, baseLang } from './model.js';
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

const isText = v => (typeof v === 'string' && v.length > 0) || (isObj(v) && Object.values(v).length > 0 && Object.values(v).every(x => typeof x === 'string'));

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
	const hosts = (Array.isArray(def.hosts) ? def.hosts : [def.hosts]).filter(x => typeof x === 'string' && HOST.test(x));
	if (!hosts.length) return bad('needs its host names (hosts) for the consent and the CSP');
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
