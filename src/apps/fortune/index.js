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
   built-in saying, like the classic command — only while this module is loaded. */

import Desk from '../../core/api.js';
import { labels, winButton, hasSheet, mod, copyWithFeedback } from '../kit.js';
import {
	MAX_TRIES, normalizeText, cleanFortunes, cleanBlock, cleanLangs, fetchCodes, DEFAULT_LANGS, createDeck, pickLang, baseLang, cleanState, pushHistory, isCat
} from './model.js';
import { BUILT_IN, cleanProvider, checkRequestUrl, categoriesFor } from './providers.js';

const { h, t, L, i18n, store } = Desk;
const KEY = 'fortune';
const SERVICE = 'fortune';
const TIMEOUT_MS = 8000;
const DEFAULT_DIR = 'site/data/fortunes/';

const warn = msg => console.warn(`[fortune] ${msg}`);

/* ---------- Configuration and sources ---------- */

const cfg = () => Desk.modules.config('fortune') ?? { remote: null, dir: DEFAULT_DIR, langs: DEFAULT_LANGS, block: [] };

const providers = new Map(Object.values(BUILT_IN).map(p => [p.id, cleanProvider(p, warn)]));
let consentFor = null;   // the provider the consent service was registered for

/** The online source when the site offers it (named, known, services.fortune: true) */
function remoteProvider() {
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
const storedSource = () => loadState()?.source ?? (remoteProvider() ? 'remote' : 'local');

function saveSource(source) {
	if (!store.setJson(KEY, { source })) Desk.announce(t('core.storageFull'), { assertive: true });
}

/** Foreign text → plain text: parsed inert (scripts never run, nothing loads), entities decoded */
function plain(s) {
	const doc = new DOMParser().parseFromString(`<!doctype html><body>${String(s)}`, 'text/html');
	for (const br of doc.body.querySelectorAll('br')) br.replaceWith('\n');
	return normalizeText(doc.body.textContent || '');
}

/* ---------- Built-in sayings ---------- */

const localCache = new Map();   // first code of the chain → Promise<{ code, data, deck } | null>

/** The sayings for the current language: its file, else the next one of the fallback chain */
function localData(lang = Desk.lang()) {
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

async function drawLocal(cat) {
	const d = await localData();
	if (!d) throw new Error('no sayings');
	const known = cat && d.data.categories.some(c => c.id === cat);
	const item = d.deck.draw(known ? cat : null);
	return item ? { ...item, lang: d.code, source: 'local' } : null;
}

/* ---------- Online source ---------- */

async function fetchRemote(p, cat) {
	const lang = pickLang(i18n.chain(), p.langs);
	const block = cfg().block;
	for (let i = 0; i < MAX_TRIES; i++) {
		const url = checkRequestUrl(p, p.url({ cat: cat || null, lang, block }));
		if (!url) throw new Error(`provider '${p.id}' built a request outside its hosts`);
		let r;
		try {
			const json = await Desk.net.getJson(url, { service: SERVICE, timeout: TIMEOUT_MS });
			r = p.parse(json, { plain, lang });
		} catch (err) {
			/* "nothing found" (e.g. a category without texts in this language) is no outage */
			if (err?.code === 'empty' || (err?.code === 'http' && p.emptyStatus.includes(err.status))) return null;
			throw err;
		}
		/* blocked (offensive, or a category the site leaves out): ask again */
		if (!r || (r.cat && block.includes(r.cat))) continue;
		const text = normalizeText(r.text);
		if (!text) throw new Error('empty answer');
		return {
			text, lang: r.lang ?? lang, cat: r.cat ?? null, source: 'remote',
			by: typeof r.by === 'string' ? normalizeText(r.by, 80) || null : null,
			url: typeof r.url === 'string' && /^https:\/\//.test(r.url) ? r.url : null
		};
	}
	throw new Error('only blocked answers');
}

/* ---------- The window ---------- */

function mount(win, body) {
	const st = { list: [], idx: -1, cat: '', busy: false, error: null, source: storedSource(), seq: 0, local: null };
	const uid = win.id;
	const lb = labels();

	/* ---------- The question first (online source only) ---------- */

	const askTitle = h('h2', { id: `${uid}-fortune-ask` });
	const askText = h('p', {});
	const askText2 = h('p', {});
	const askLang = h('p', { hidden: true });
	const denyBtn = h('button', { type: 'button', class: 'btn', onclick: () => deny() });
	const allowBtn = h('button', { type: 'button', class: 'btn btn-primary', onclick: () => allow() });
	const setBtn = h('button', { type: 'button', class: 'fortune-textbtn', onclick: () => Desk.showSettings('online') });
	lb.bind(denyBtn, 'fortune.deny', ['text']);
	lb.bind(allowBtn, 'fortune.allow', ['text']);
	lb.bind(setBtn, 'fortune.toSettings', ['text']);
	lb.bind(askTitle, 'fortune.askTitle', ['text']);
	lb.bind(askText2, 'fortune.askText2', ['text']);
	const ask = h('section', { class: 'fortune-ask', 'aria-labelledby': askTitle.id, hidden: true },
		Desk.tile(win.app, 'fortune-tile'),
		askTitle, askText, askText2, askLang,
		h('div', { class: 'fortune-btns' }, denyBtn, allowBtn),
		setBtn);

	/* ---------- The sayings ---------- */

	const srcLabel = h('label', { class: 'fortune-label', for: `${uid}-fortune-src` });
	const srcSelect = h('select', { class: 'fortune-select', id: `${uid}-fortune-src` });
	const srcField = h('div', { class: 'fortune-field', hidden: true }, srcLabel, srcSelect);
	const catLabel = h('label', { class: 'fortune-label', for: `${uid}-fortune-cat` });
	const catSelect = h('select', { class: 'fortune-select', id: `${uid}-fortune-cat` });
	const catField = h('div', { class: 'fortune-field', hidden: true }, catLabel, catSelect);
	lb.bind(srcLabel, 'fortune.source', ['text']);
	lb.bind(catLabel, 'fortune.category', ['text']);

	const quote = h('blockquote', { class: 'fortune-quote', dir: 'auto' });
	const byline = h('figcaption', { class: 'fortune-by', hidden: true });
	const card = h('figure', { class: 'fortune-card', 'aria-live': 'polite' }, Desk.icon('ti-cookie', 'i fortune-mark'), quote, byline);
	const status = h('p', { class: 'fortune-status', role: 'status' });
	const keys = h('p', { class: 'fortune-keys' });
	const nextBtn = h('button', { type: 'button', class: 'btn btn-primary fortune-next', onclick: () => next() });
	const main = h('div', { class: 'fortune-main' },
		h('div', { class: 'fortune-top' }, srcField, catField),
		card,
		h('div', { class: 'fortune-foot' }, status, nextBtn),
		keys);

	body.append(h('div', { class: 'fortune' }, ask, main));

	const prevBtn = winButton(win, lb, 'ti-chevron-left', 'fortune.prev', () => prev(), 'fortune-prev');
	const copyBtn = winButton(win, lb, 'ti-copy', 'fortune.copy', () => copy());
	const webBtn = winButton(win, lb, 'ti-external-link', 'fortune.web', () => openWeb());
	win.addActions(prevBtn, copyBtn, webBtn);

	/* ---------- Labels ---------- */

	const remoteActive = () => (st.source === 'remote' ? remoteProvider() : null);
	const hostOf = p => (p ? i18n.list(p.hosts) : '');

	/* The categories of the active source (an online one: those it has in the language it
	   answers in), sorted by their name in the current language — as in the original */
	function categories() {
		const p = remoteActive();
		const list = p
			? categoriesFor(p, pickLang(i18n.chain(), p.langs))
				.filter(c => !cfg().block.includes(c.id)).map(c => ({ id: c.id, label: L(c.label) }))
			: (st.local?.data.categories ?? []).map(c => ({ id: c.id, label: c.label }));
		const byName = i18n.collator({ sensitivity: 'base' });
		return list.sort((a, b) => byName.compare(a.label, b.label));
	}

	function fillSelects() {
		const p = remoteProvider();
		srcField.hidden = !p;
		if (p) {
			srcSelect.replaceChildren(
				h('option', { value: 'local', text: t('fortune.sourceLocal') }),
				h('option', { value: 'remote', text: L(p.name) }));
			srcSelect.value = remoteActive() ? 'remote' : 'local';
		}
		const cats = categories();
		if (st.cat && !cats.some(c => c.id === st.cat)) st.cat = '';
		catField.hidden = !cats.length;
		catSelect.replaceChildren(
			h('option', { value: '', text: t('fortune.any') }),
			...cats.map(c => h('option', { value: c.id, text: c.label })));
		catSelect.value = st.cat;
	}

	function relabelAll() {
		lb.apply();
		const p = remoteProvider();
		if (p) {
			askText.textContent = t('fortune.askText', { provider: L(p.name), host: hostOf(p) });
			/* The texts come in another language than the user's: say so */
			const lang = pickLang(i18n.chain(), p.langs);
			askLang.hidden = baseLang(lang) === baseLang(Desk.lang());
			askLang.textContent = askLang.hidden ? '' : t('fortune.askLang', { language: i18n.displayName(lang, Desk.lang()) });
		}
		const rtl = i18n.dir() === 'rtl';
		keys.textContent = t('fortune.keys', { space: i18n.keys('Space'), back: rtl ? '→' : '←', next: rtl ? '←' : '→' });
		fillSelects();
	}

	/* The question until the user agrees — also again when the settings took it back */
	function view() {
		const p = remoteActive();
		const ok = !p || Desk.consent.granted(SERVICE);
		ask.hidden = ok;
		main.hidden = !ok;
		for (const b of [prevBtn, copyBtn, webBtn]) b.hidden = !ok;
		return ok;
	}

	function errorText() {
		switch (st.error) {
			case 'offline': return t('fortune.offline');
			case 'error': return t('fortune.error', { host: hostOf(remoteActive() ?? remoteProvider()) });
			case 'local': return t('fortune.localError');
			case 'empty': return t('fortune.empty');
			default: return '';
		}
	}

	function update() {
		const item = st.list[st.idx];
		/* The card stays, also empty — the status line below says why */
		quote.textContent = item ? item.text : '';
		if (item?.lang) quote.lang = item.lang;
		else quote.removeAttribute('lang');
		byline.textContent = item?.by ? t('fortune.by', { name: item.by }) : '';
		byline.hidden = !item?.by;
		status.textContent = st.busy ? t('fortune.loading') : errorText();
		status.classList.toggle('is-error', !!st.error && !st.busy);
		nextBtn.textContent = t(st.error && st.error !== 'empty' && !item ? 'fortune.retry' : 'fortune.next');
		/* aria-disabled instead of disabled: the button keeps the keyboard focus */
		nextBtn.setAttribute('aria-disabled', String(st.busy));
		prevBtn.disabled = st.idx <= 0;
		copyBtn.disabled = !item;
		webBtn.disabled = !item?.url;
	}

	/* ---------- Actions ---------- */

	async function next(fresh = false) {
		if (st.busy) return;
		if (!view()) {
			allowBtn.focus({ preventScroll: true });
			return;
		}
		/* Forward through the history first, as a browser does */
		if (!fresh && st.idx < st.list.length - 1) {
			st.idx++;
			st.error = null;
			update();
			return;
		}
		const p = remoteActive();
		if (p && navigator.onLine === false) {
			st.error = 'offline';
			update();
			return;
		}
		const seq = ++st.seq;
		st.busy = true;
		st.error = null;
		update();
		try {
			const item = p ? await fetchRemote(p, st.cat) : await drawLocal(st.cat);
			if (seq !== st.seq) return;
			if (!item) st.error = 'empty';
			else Object.assign(st, pushHistory(st.list, st.idx, item));
		} catch (err) {
			if (seq !== st.seq) return;
			if (err?.code === 'consent') view();
			else st.error = p ? (err?.code === 'network' && navigator.onLine === false ? 'offline' : 'error') : 'local';
			if (st.error === 'error') warn(err?.message ?? String(err));
		} finally {
			if (seq === st.seq) {
				st.busy = false;
				if (win.el.isConnected) update();
			}
		}
	}

	function prev() {
		if (st.idx <= 0) return;
		st.idx--;
		st.error = null;
		update();
	}

	async function copy() {
		const item = st.list[st.idx];
		if (item) await copyWithFeedback(copyBtn, item.text, { key: 'fortune.copy', doneKey: 'fortune.copied' });
	}

	function openWeb() {
		const url = st.list[st.idx]?.url;
		if (url) Desk.openUrl(url);
	}

	/* Switching the source drops a pending request; the history stays (each entry keeps its language) */
	function setSource(source, { focus = false } = {}) {
		/* the source select sits in the part that the question may hide: keep the focus */
		const had = main.contains(document.activeElement);
		const s = source === 'remote' && remoteProvider() ? 'remote' : 'local';
		st.source = s;
		saveSource(s);
		st.seq++;
		st.busy = false;
		st.error = null;
		st.cat = '';
		fillSelects();
		const ok = view();
		update();
		if (ok) {
			if (focus) nextBtn.focus({ preventScroll: true });
			next(true);
		} else if (focus || had) allowBtn.focus({ preventScroll: true });
	}

	function allow() {
		Desk.consent.set(SERVICE, true);
		view();
		nextBtn.focus({ preventScroll: true });
		next();
	}

	/* "No": the built-in sayings instead (the original closed the window — it had nothing else) */
	const deny = () => setSource('local', { focus: true });

	/* The built-in data of the current language (also after a language switch) */
	async function refreshLocal() {
		const d = await localData();
		if (!win.el.isConnected || d === st.local) return;
		st.local = d;
		if (!remoteActive()) fillSelects();
	}

	srcSelect.addEventListener('change', () => setSource(srcSelect.value));
	catSelect.addEventListener('change', () => {
		st.cat = isCat(catSelect.value) && categories().some(c => c.id === catSelect.value) ? catSelect.value : '';
		next(true);
	});

	win.el.addEventListener('keydown', e => {
		if (main.hidden || e.altKey || hasSheet(win)) return;
		if (mod(e) && e.key.toLowerCase() === 'c' && !getSelection().toString()) {
			copy();
			return;
		}
		if (e.ctrlKey || e.metaKey || e.target.closest('select, input, textarea, .win-bar')) return;
		/* A focused button reacts to Enter and Space itself */
		if ((e.key === ' ' || e.key === 'Enter') && e.target.closest('button')) return;
		const rtl = i18n.dir() === 'rtl';
		if (e.key === ' ' || e.key.toLowerCase() === 'n' || e.key === (rtl ? 'ArrowLeft' : 'ArrowRight')) {
			e.preventDefault();
			next();
		} else if (e.key === (rtl ? 'ArrowRight' : 'ArrowLeft')) {
			e.preventDefault();
			prev();
		}
	});

	/* Consent given or taken back elsewhere (settings, another tab) */
	const offConsent = Desk.on('consent:change', ({ id } = {}) => {
		if (id !== SERVICE && id !== null) return;
		if (view() && !st.list.length && !st.busy) next();
		else update();
	});
	/* Another tab (or a backup) changed the source */
	const offStore = Desk.on('store:change', ({ name, external } = {}) => {
		if (name !== KEY || !external) return;
		const s = storedSource();
		if (s !== st.source) setSource(s);
	});
	const offRestore = Desk.on('storage:restore', ({ names } = {}) => {
		if (!names?.includes(KEY)) return;
		const s = storedSource();
		if (s !== st.source) setSource(s);
	});

	win.state.fortune = {
		relabel() {
			relabelAll();
			update();
			refreshLocal();
		},
		view, update, next, prev, copy,
		canPrev: () => st.idx > 0,
		hasItem: () => !!st.list[st.idx],
		focusFirst: () => (main.hidden ? allowBtn : nextBtn).focus({ preventScroll: true }),
		off() {
			st.seq++;
			offConsent();
			offStore();
			offRestore();
		}
	};

	relabelAll();
	update();
	refreshLocal();
	if (view()) next();
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
	styles: ['fortune.css'],

	app: { icon: 'ti-cookie', tint: 'orange', size: [540, 460], name: '@fortune.appName', desc: '@fortune.appDesc' },

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
	},

	mount,

	focus(win) {
		win.state.fortune?.view();
		win.state.fortune?.focusFirst();
	},

	relabel(win) {
		win.state.fortune?.relabel();
	},

	menu(win) {
		const f = win.state.fortune;
		if (!f) return [];
		return [
			{ label: t('fortune.next'), run: () => f.next() },
			{ label: t('fortune.prev'), disabled: !f.canPrev(), run: () => f.prev() },
			{ label: t('fortune.copy'), disabled: !f.hasItem(), run: () => f.copy() },
			...(remoteProvider() ? ['-', { label: t('fortune.privacy'), run: () => Desk.showSettings('online') }] : [])
		];
	},

	unmount(win) {
		win.state.fortune?.off();
	}
};
