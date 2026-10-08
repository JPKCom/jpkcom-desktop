/* JPKCom Desktop — Fortune app: the window (loaded when it first opens) — © Jean Pierre Kolb — MIT License

   The question (online source only), the saying with its history, the source
   and category selects, and the requests to the online source (index.js has
   the descriptor, the config, the built-in sayings, the consent and the
   service). win.state.fortune is the open window's handle.

   Texts that name the app go through appText() (config.fortune.texts). Key
   functions given to lb.bind()/winButton() run at once: they may only use
   module-level helpers (appText, cfg) or ones declared before the first bind. */

import Desk from '../../core/api.js';
import { labels, winButton, hasSheet, mod, copyWithFeedback } from '../kit.js';
import { MAX_TRIES, normalizeText, pickLang, baseLang, pushHistory, isCat, sourceFor } from './model.js';
import { checkRequestUrl, categoriesFor } from './providers.js';
import { KEY, SERVICE, TIMEOUT_MS, warn, cfg, appText, remoteProvider, storedSource, saveSource, localData, drawLocal } from './index.js';

const { h, t, L, i18n } = Desk;

/* ---------- Online source ---------- */

/** Foreign text → plain text: parsed inert (scripts never run, nothing loads), entities decoded */
function plain(s) {
	const doc = new DOMParser().parseFromString(`<!doctype html><body>${String(s)}`, 'text/html');
	for (const br of doc.body.querySelectorAll('br')) br.replaceWith('\n');
	return normalizeText(doc.body.textContent || '');
}

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
	/* "No": the built-in sayings — or, online only, close the window (deny() below) */
	lb.bind(denyBtn, () => appText(cfg().local !== false ? 'deny' : 'denyOnline'), ['text']);
	lb.bind(allowBtn, () => appText('allow'), ['text']);
	lb.bind(setBtn, 'fortune.toSettings', ['text']);
	lb.bind(askTitle, () => appText('askTitle'), ['text']);
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
	/* the app's own glyph (logo, mark or icon of a site override), as the question's tile */
	const mark = Desk.icons.appGlyph(win.app, { cls: 'i fortune-mark', fallback: 'ti-cookie' });
	const card = h('figure', { class: 'fortune-card', 'aria-live': 'polite' }, mark, quote, byline);
	const status = h('p', { class: 'fortune-status', role: 'status' });
	const keys = h('p', { class: 'fortune-keys' });
	const nextBtn = h('button', { type: 'button', class: 'btn btn-primary fortune-next', onclick: () => next() });
	const main = h('div', { class: 'fortune-main' },
		h('div', { class: 'fortune-top' }, srcField, catField),
		card,
		h('div', { class: 'fortune-foot' }, status, nextBtn),
		keys);

	body.append(h('div', { class: 'fortune' }, ask, main));

	const prevBtn = winButton(win, lb, 'ti-chevron-left', () => appText('prev'), () => prev(), 'fortune-prev');
	const copyBtn = winButton(win, lb, 'ti-copy', () => appText('copy'), () => copy());
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
		/* online only: nothing to choose */
		srcField.hidden = !p || cfg().local === false;
		if (!srcField.hidden) {
			srcSelect.replaceChildren(
				h('option', { value: 'local', text: appText('sourceLocal') }),
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
			case 'local': return appText('localError');
			case 'empty': return appText('empty');
			case 'nosource': return appText('noSource');
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
		status.textContent = st.busy ? appText('loading') : errorText();
		status.classList.toggle('is-error', !!st.error && !st.busy);
		nextBtn.textContent = st.error && st.error !== 'empty' && st.error !== 'nosource' && !item ? t('fortune.retry') : appText('next');
		/* aria-disabled instead of disabled: the button keeps the keyboard focus (also without a source) */
		nextBtn.setAttribute('aria-disabled', String(st.busy || st.error === 'nosource'));
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
		/* online only and no usable source: say so instead of loading */
		if (cfg().local === false && !remoteActive()) {
			st.error = 'nosource';
			update();
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
		if (item) await copyWithFeedback(copyBtn, item.text, { key: () => appText('copy'), doneKey: () => appText('copied') });
	}

	function openWeb() {
		const url = st.list[st.idx]?.url;
		if (url) Desk.openUrl(url);
	}

	/* Switching the source drops a pending request; the history stays (each entry keeps its language) */
	function setSource(source, { focus = false } = {}) {
		/* the source select sits in the part that the question may hide: keep the focus */
		const had = main.contains(document.activeElement);
		/* online only: always the online source (null without a usable one → next() says so) */
		const s = sourceFor({ stored: source, local: cfg().local !== false, remote: !!remoteProvider() });
		st.source = s;
		if (s) saveSource(s);
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

	/* "No": the built-in sayings instead (the original closed the window — it had nothing else);
	   online only there is nothing else either: close it, the question comes again next time */
	const deny = () => (cfg().local !== false ? setSource('local', { focus: true }) : Desk.close(win));

	/* The built-in data of the current language (also after a language switch) */
	async function refreshLocal() {
		if (cfg().local === false) return;
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

export default {
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
			{ label: appText('next'), run: () => f.next() },
			{ label: appText('prev'), disabled: !f.canPrev(), run: () => f.prev() },
			{ label: appText('copy'), disabled: !f.hasItem(), run: () => f.copy() },
			...(remoteProvider() ? ['-', { label: t('fortune.privacy'), run: () => Desk.showSettings('online') }] : [])
		];
	},

	unmount(win) {
		win.state.fortune?.off();
	}
};
