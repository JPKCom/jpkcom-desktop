/* JPKCom Desktop — Search: one quick search over every app, collection and provider — © Jean Pierre Kolb — MIT License

   A search palette under the menu bar (Mod+K by default, "/" on the desktop,
   the magnifier in the menu bar, Desk.searchFor(q)):

   - Groups: "Apps" (every launchable app that is not a collection item),
     one group per collection (site/apps.js, unless it says search: false),
     then the providers — 'search' contributions of other modules, providers
     added with search.addProvider() and the optional full-text index
     (config.search.pagefind). The index of apps is rebuilt on every open
     (names follow the language; modules and the vault add apps late).
   - Scoring: every word of the query has to hit; name start > word start >
     name > id > group > description. The group holding the best hit comes
     first; providers follow in their order. Providers run debounced and
     asynchronously; earlier hits stay until the new ones arrive.
   - Accessibility: the field is a combobox (aria-activedescendant) over a
     listbox with one group per section; the rows are never focused, so the
     field keeps the focus (and the phone keyboard). ↑/↓ select, Enter opens,
     the first Esc clears, the second closes and returns the focus. The
     result count is announced once typing pauses.
   - Etiquette: opening emits 'popovers:close' { except: 'search' }; any other
     'popovers:close', a click outside, Tab out of it or a window blur closes it.

   Service 'search': { open(q?), close(returnFocus?), toggle(), isOpen(), addProvider(def) → remove() }.
   Provider: { id, label, order?, max?, minLength?, delay?, warm?(), available?(), search(q, ctx) → results | Promise<results> }
     available() → false: permanently unavailable (index failed to load) — shown as such, never asked
     ctx: { query, words, fold, signal, lang, max }
     result: { title, sub?, app?: id | entry | { icon, tint, logo, mark }, icon?, tint?, url?, run?(), external?, key? } */

import { fold, entry, rank, queryWords, matchCombo, ariaKeys, cleanConfig, cleanProvider, cleanResults } from './engine.js';
import { createPagefind } from './pagefind.js';

const SELF = 'search';

let D = null;            // the Desk API
let cfg = null;          // cleaned config.search
let btn = null;          // menu bar button (null while no menu bar exists)

let el = null;           // the open palette (null when closed)
let input = null;
let results = null;
let list = null;
let empty = null;
let statusEl = null;
let keysEl = null;
let returnTo = null;
let options = [];        // [{ key, el, run }] in display order
let sel = -1;
let index = [];          // searchable entries (rebuilt on open)
let groups = [];         // [{ id, label, max }] of the local index
let liveTimer = 0;
let closing = null;      // { node, timer } of a palette fading out

const added = new Map(); // providers from addProvider(): id → def
const states = new Map(); // provider id → { q, state: 'idle'|'loading'|'done'|'off', hits, timer, seq, ctrl }
const warned = new Set();

const t = (key, params) => D.t(key, params);

/* ---------- Providers ---------- */

/** Every provider: module contributions first (load order), then addProvider(); sorted by order */
function providers() {
	const seen = new Set();
	const out = [];
	for (const raw of [...D.modules.contributions('search'), ...added.values()]) {
		const p = cleanProvider(raw, msg => {
			if (!warned.has(msg)) {
				warned.add(msg);
				console.warn(`[search] ${msg}`);
			}
		});
		if (!p || seen.has(p.id)) continue;
		seen.add(p.id);
		out.push(p);
	}
	return out.sort((a, b) => a.order - b.order);
}

/* available() → false: the provider cannot answer any more (e.g. its index failed to load) */
function gone(p) {
	try {
		return p.available?.() === false;
	} catch {
		return true;
	}
}

function stateOf(p) {
	if (!states.has(p.id)) states.set(p.id, { q: '', state: 'idle', hits: [], timer: 0, seq: 0, ctrl: null });
	return states.get(p.id);
}

function stopProviders() {
	for (const st of states.values()) {
		clearTimeout(st.timer);
		st.ctrl?.abort();
		st.ctrl = null;
		st.seq++;
	}
}

function resetProviders() {
	stopProviders();
	states.clear();
}

/* Asks every provider for the current query, each after its own pause in typing */
function queueProviders() {
	const q = input.value.trim();
	for (const p of providers()) {
		const st = stateOf(p);
		clearTimeout(st.timer);
		st.ctrl?.abort();
		st.ctrl = null;
		const id = ++st.seq;
		if (q.length < p.minLength) {
			Object.assign(st, { q, state: 'idle', hits: [] });
			continue;
		}
		/* Known to be unavailable: say so at once, without a delay or another warning */
		if (gone(p)) {
			Object.assign(st, { q, state: 'off', hits: [] });
			continue;
		}
		/* Earlier hits stay visible until the new ones arrive */
		Object.assign(st, { q, state: 'loading' });
		const ctrl = new AbortController();
		st.ctrl = ctrl;
		const max = p.max ?? cfg.maxPerGroup;
		st.timer = setTimeout(async () => {
			let hits = [];
			let state = 'done';
			try {
				const res = await p.search(q, { query: q, words: queryWords(q), fold, signal: ctrl.signal, lang: D.lang(), max });
				hits = cleanResults(res, max);
			} catch (err) {
				/* A provider that now reports itself unavailable has warned already */
				if (!ctrl.signal.aborted && !gone(p)) console.warn(`[search] provider '${p.id}' failed:`, err?.message ?? err);
				state = 'off';
			}
			if (id !== st.seq || !el) return;
			Object.assign(st, { q, state, hits, ctrl: null });
			render(true);
		}, p.delay);
	}
}

/** addProvider(def) → remove(): a provider for this session (modules may also contribute `search: [...]`) */
function addProvider(def) {
	const p = cleanProvider(def, msg => console.warn(`[search] addProvider: ${msg}`));
	if (!p) return () => {};
	if (added.has(p.id) || D.modules.contributions('search').some(c => c.id === p.id)) {
		console.warn(`[search] addProvider: a provider '${p.id}' exists already — ignored`);
		return () => {};
	}
	added.set(p.id, def);
	if (el) {
		try { p.warm?.(); } catch { /* optional */ }
		queueProviders();
		render(true);
	}
	return () => {
		if (added.get(p.id) !== def) return;
		added.delete(p.id);
		const st = states.get(p.id);
		if (st) {
			clearTimeout(st.timer);
			st.ctrl?.abort();
			states.delete(p.id);
		}
		if (el) render(true);
	};
}

/* ---------- Local index ---------- */

/* Rebuilt on every open: names follow the language, apps come and go (modules, vault) */
function buildIndex() {
	const reg = D.apps;
	const max = cfg.maxPerGroup;
	const out = [];
	const defs = [{ id: 'apps', label: t('search.groupApps'), max }];
	for (const app of reg.list()) {
		/* collection items (and items that point to another app) belong to their collection's group */
		if (app.kind === 'launcher' || (app.collection && app.slug)) continue;
		out.push(entry({ app, group: 'apps', name: reg.name(app), slug: app.id, desc: reg.desc(app) }));
	}
	for (const c of reg.collections()) {
		if (c.search === false) continue;
		const id = `c-${c.id}`;
		const byId = new Map(c.groups.map(g => [g.id, g]));
		let n = 0;
		for (const app of reg.items(c.id)) {
			/* An item that only points to another app is found as that app */
			if (app.alias || app.hidden || app.kind === 'launcher' || !reg.available(app)) continue;
			const g = byId.get(app.group);
			out.push(entry({ app, group: id, name: reg.name(app), slug: app.slug ?? app.id, cat: g ? D.L(g.name) : '', desc: reg.desc(app) }));
			n++;
		}
		if (n) defs.push({ id, label: D.L(c.name), max });
	}
	index = out;
	groups = defs;
}

/* ---------- Rendering ---------- */

const tileSource = r => {
	if (typeof r.app === 'string') {
		const app = D.apps.get(r.app);
		return app && D.apps.available(app) ? app : { icon: r.icon ?? 'ti-search', tint: r.tint ?? 'slate' };
	}
	if (r.app && typeof r.app === 'object') return r.app;
	return { icon: r.icon ?? 'ti-search', tint: r.tint ?? 'slate' };
};

/* The app a provider row opens when it has neither run() nor url (null when it names none that exists) */
const rowApp = r => {
	const id = typeof r.app === 'string' ? r.app : r.app?.id;
	return id && D.apps.has(id) ? id : null;
};

/* cleanResults() checked the shape; whether the app exists is known only here */
const opens = r => !!(r.run || r.url || rowApp(r));

function runResult(r) {
	if (r.run) return r.run();
	if (r.url) return D.openUrl(r.url);
	const app = rowApp(r);
	return app ? D.launch(app) : null;
}

function render(keep = false) {
	const q = input.value.trim();
	const prevKey = keep ? options[sel]?.key : null;
	options = [];
	let n = 0;

	const option = (key, app, name, sub, external, run) => {
		const opt = D.h('div', { class: 'search-item', role: 'option', id: `search-o${n++}`, 'aria-selected': 'false' },
			D.tile(app),
			D.h('span', { class: 'search-text' },
				D.h('span', { class: 'search-name', text: name }),
				sub?.length ? D.h('span', { class: 'search-sub' }, sub) : null),
			external ? [D.icon('ti-external-link', 'i search-ext'), D.h('span', { class: 'visually-hidden', text: t('search.newTab') })] : null);
		options.push({ key, el: opt, run });
		return opt;
	};

	const group = (id, label, items) => D.h('div', { role: 'group', 'aria-labelledby': `search-g-${id}` },
		D.h('div', { class: 'search-head', id: `search-g-${id}`, role: 'presentation', text: label }),
		items);

	const all = q ? providers() : [];
	const active = all.filter(p => q.length >= p.minLength);
	const local = q ? rank(index, q, groups, (a, b) => D.i18n.compare(a, b)) : [];

	list.replaceChildren(
		...local.map(({ group: g, items }) => group(g.id, g.label,
			items.map(({ e }) => option(e.app.id, e.app, e.label, e.sub, e.app.kind === 'link', () => D.launch(e.app.id))))),
		...active.filter(p => stateOf(p).hits.some(opens)).map(p => group(`p-${p.id}`, D.L(p.label),
			stateOf(p).hits.filter(opens).map(r => {
				const app = tileSource(r);
				return option(`p:${p.id}:${r.key ?? r.url ?? r.title}`, app, r.title, r.sub, r.external || app.kind === 'link', () => runResult(r));
			})))
	);

	const loading = active.filter(p => stateOf(p).state === 'loading');
	const off = active.filter(p => stateOf(p).state === 'off');
	const count = options.length;
	const none = !!q && !count && !loading.length;
	empty.hidden = !none;
	results.hidden = !count && !none;
	input.setAttribute('aria-expanded', String(count > 0));

	const i = prevKey ? options.findIndex(o => o.key === prevKey) : -1;
	select(i >= 0 ? i : count ? 0 : -1, false);
	if (!keep) results.scrollTop = 0;

	const names = ps => D.i18n.list(ps.map(p => D.L(p.label)));
	const hits = t('search.hits', { n: count });
	const status = !q ? t('search.scope', { list: D.i18n.list([...groups.map(g => g.label), ...providers().map(p => D.L(p.label))]) })
		: loading.length ? t('search.loading', { list: names(loading) })
		: off.length ? t('search.off', { hits, list: names(off) })
		: hits;
	statusEl.textContent = status;

	/* Screen readers hear the count once typing pauses, not on every key */
	clearTimeout(liveTimer);
	if (q && !loading.length) liveTimer = setTimeout(() => { if (el) D.announce(status); }, 700);
}

function select(i, scroll = true) {
	options[sel]?.el.setAttribute('aria-selected', 'false');
	sel = i;
	const opt = options[sel];
	if (!opt) {
		input.removeAttribute('aria-activedescendant');
		return;
	}
	opt.el.setAttribute('aria-selected', 'true');
	input.setAttribute('aria-activedescendant', opt.el.id);
	if (scroll) reveal(opt.el);
}

/* scrollIntoView() would scroll the desktop as well; the first row of a group brings its title along */
function reveal(opt) {
	const prev = opt.previousElementSibling;
	const head = prev?.classList.contains('search-head') ? prev : null;
	const top = (head || opt).offsetTop - 4;
	const bottom = opt.offsetTop + opt.offsetHeight + 6;
	if (top < results.scrollTop) results.scrollTop = top;
	else if (bottom > results.scrollTop + results.clientHeight) results.scrollTop = bottom - results.clientHeight;
}

function keys() {
	return D.h('span', { class: 'search-keys', 'aria-hidden': 'true' },
		D.h('span', {}, D.h('kbd', { text: '↑↓' }), t('search.keySelect')),
		D.h('span', {}, D.h('kbd', { text: '↵' }), t('search.keyOpen')),
		D.h('span', {}, D.h('kbd', { text: D.i18n.keys('Escape', { symbols: false }) }), t('search.keyClose')));
}

function run(opt) {
	if (!opt) return;
	close(false);
	try {
		opt.run();
	} catch (err) {
		console.warn('[search] opening a result failed:', err);
	}
}

/* ---------- Open / close ---------- */

function setQuery(q) {
	input.value = q;
	queueProviders();
	render();
}

function open(q = '') {
	q = typeof q === 'string' ? q.slice(0, 200) : '';
	if (el) {
		if (q) setQuery(q);
		input.focus({ preventScroll: true });
		return;
	}
	/* A palette still fading out would share the ids (aria-controls, aria-activedescendant) */
	if (closing) {
		clearTimeout(closing.timer);
		closing.node.remove();
		closing = null;
	}
	D.emit('popovers:close', { except: SELF });
	returnTo = document.activeElement;
	buildIndex();
	resetProviders();
	options = [];
	sel = -1;

	input = D.h('input', {
		type: 'search', name: 'search', class: 'search-input', role: 'combobox', autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'go',
		'aria-autocomplete': 'list', 'aria-controls': 'search-list', 'aria-expanded': 'false',
		placeholder: t('search.placeholder'), 'aria-label': t('search.placeholder')
	});
	list = D.h('div', { class: 'search-list', id: 'search-list', role: 'listbox', 'aria-label': t('search.title') });
	empty = D.h('p', { class: 'search-empty', hidden: true, text: t('core.noResults') });
	results = D.h('div', { class: 'search-results', hidden: true }, list, empty);
	statusEl = D.h('span', { class: 'search-status' });
	keysEl = keys();
	const foot = D.h('div', { class: 'search-foot' }, statusEl, keysEl);
	const node = D.h('div', { class: 'search-palette', role: 'dialog', 'aria-label': t('search.title') },
		D.h('label', { class: 'search-field' }, D.icon('ti-search'), input),
		results, foot);
	el = node;

	input.addEventListener('input', () => {
		queueProviders();
		render();
	});

	input.addEventListener('keydown', e => {
		if (e.isComposing) return;
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			if (options.length) select((sel + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			run(options[sel]);
		} else if (e.key === 'Escape') {
			/* The first Esc clears the search, the second closes */
			e.preventDefault();
			e.stopPropagation();
			if (input.value) setQuery('');
			else close(true);
		}
	});

	/* Rows are not focusable: the field keeps the focus (and the phone keyboard) */
	list.addEventListener('pointerdown', e => {
		if (e.target.closest('.search-item')) e.preventDefault();
	});
	list.addEventListener('click', e => {
		const row = e.target.closest('.search-item');
		if (row) run(options.find(o => o.el === row));
	});
	list.addEventListener('pointermove', e => {
		if (e.pointerType !== 'mouse') return;
		const i = options.findIndex(o => o.el === e.target.closest('.search-item'));
		if (i >= 0 && i !== sel) select(i, false);
	});

	/* Tab moves on and closes; a phone keyboard's "Done" (no new target) does not */
	node.addEventListener('focusout', e => {
		if (el === node && e.relatedTarget && !node.contains(e.relatedTarget)) close(false);
	});

	render();
	document.body.append(node);
	btn?.setAttribute('aria-expanded', 'true');
	/* Providers with an index to load (full text) start now, not on the first key */
	for (const p of providers()) {
		try { p.warm?.(); } catch (err) { console.warn(`[search] provider '${p.id}' warm-up failed:`, err); }
	}

	if (D.reduceMotion()) node.classList.add('is-open');
	else requestAnimationFrame(() => requestAnimationFrame(() => { if (el === node) node.classList.add('is-open'); }));
	input.focus({ preventScroll: true });
	if (q) setQuery(q);
}

function close(returnFocus = false) {
	if (!el) return;
	const node = el;
	el = null;
	stopProviders();
	clearTimeout(liveTimer);
	options = [];
	sel = -1;
	btn?.setAttribute('aria-expanded', 'false');
	node.classList.remove('is-open');
	if (D.reduceMotion()) {
		node.remove();
	} else {
		const fading = {
			node,
			timer: setTimeout(() => {
				node.remove();
				if (closing === fading) closing = null;
			}, D.config.ui?.animMs ?? 240)
		};
		closing = fading;
	}
	if (returnFocus) (returnTo?.isConnected ? returnTo : btn)?.focus({ preventScroll: true });
}

const toggle = () => (el ? close(true) : open());

/* ---------- Labels ---------- */

function labelButton() {
	if (!btn) return;
	const label = cfg.shortcut ? t('search.button', { keys: D.i18n.keys(cfg.shortcut) }) : t('search.title');
	btn.setAttribute('aria-label', label);
	btn.title = label;
	if (cfg.shortcut) btn.setAttribute('aria-keyshortcuts', ariaKeys(cfg.shortcut, D.env.hasCmdKey()));
}

function relabel() {
	labelButton();
	if (!el) return;
	el.setAttribute('aria-label', t('search.title'));
	list.setAttribute('aria-label', t('search.title'));
	input.placeholder = t('search.placeholder');
	input.setAttribute('aria-label', t('search.placeholder'));
	empty.textContent = t('core.noResults');
	const fresh = keys();
	keysEl.replaceWith(fresh);
	keysEl = fresh;
	buildIndex();
	resetProviders();
	queueProviders();
	render();
}

/* ---------- Module ---------- */

export default {
	id: 'search',
	kind: 'module',
	i18n: ['search'],
	styles: ['search.css'],
	configKey: 'search',
	validateConfig: cleanConfig,

	setup(desk) {
		D = desk;
		cfg = desk.modules.config('search') ?? cleanConfig(desk.config.search);

		if (cfg.pagefind) addProvider(createPagefind(desk, cfg.pagefind));

		desk.provide('search', Object.freeze({
			open,
			close: (returnFocus = false) => close(returnFocus === true),
			toggle,
			isOpen: () => !!el,
			addProvider
		}));

		/* The magnifier in the menu bar, once there is a menu bar */
		btn = desk.h('button', {
			type: 'button', class: 'mb-item mb-search', id: 'mb-search', 'aria-haspopup': 'dialog', 'aria-expanded': 'false',
			onclick: toggle
		}, desk.icon('ti-search'));
		labelButton();
		desk.services.when('menubar').then(mb => {
			try {
				mb.addStatus(btn, 10);
			} catch (err) {
				console.warn('[search] the menu bar did not take the search button:', err);
			}
		});

		/* Mod+K everywhere: through the shortcuts service (it also listens inside iframes);
		   while there is none, a listener of our own */
		if (cfg.shortcut) {
			desk.services.when('shortcuts').then(sc => {
				try {
					sc.add({ id: 'search', keys: cfg.shortcut, label: '@search.open', scope: 'global', run: () => { toggle(); return true; } });
				} catch (err) {
					console.warn('[search] the shortcut could not be registered:', err);
				}
			});
			addEventListener('keydown', e => {
				if (desk.service('shortcuts') || e.defaultPrevented || e.isComposing) return;
				if (!matchCombo(cfg.shortcut, e)) return;
				e.preventDefault();
				e.stopPropagation();
				toggle();
			}, true);
		}

		/* "/" anywhere but in a field — in the bubble phase, so an app that uses the key
		   itself (calculator, terminal) takes it first: its preventDefault() keeps the search shut */
		addEventListener('keydown', e => {
			if (e.defaultPrevented || el) return;
			if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.isComposing && !desk.dom.editable(e.target)) {
				e.preventDefault();
				open();
			}
		});

		document.addEventListener('pointerdown', e => {
			if (el && !el.contains(e.target) && !btn?.contains(e.target)) close(false);
		}, true);
		/* A click into an iframe or another browser tab */
		addEventListener('blur', () => close(false));

		desk.on('popovers:close', ({ except } = {}) => {
			if (except !== SELF) close(false);
		});
		desk.on('lang:change', relabel);
		desk.on('apps:change', () => {
			if (!el) return;
			buildIndex();
			render(true);
		});
	}
};
