/* JPKCom Desktop — Editor app: plain-text documents in tabs — © Jean Pierre Kolb — MIT License

   Tabs (config.editor.maxTabs, default 20), line numbers, word wrap (Alt+Z),
   invisible characters (Alt+I), find and replace (Ctrl/⌘+F, G; regular
   expressions, match case), open and save local files (Ctrl/⌘+O, S,
   Shift+S) — through the File System Access API where the browser has it
   (Save then writes back into the same file), else a file input and a
   download. Every tab's draft survives in storage key 'editor' (model.js).

   One textarea per tab (hidden when not current), so each keeps its own
   undo history, cursor and scroll; gutter, highlight layers and the wrap
   mirror are shared and rebuilt on a tab switch. Replacing goes through
   execCommand('insertText'), so the browser's undo keeps working.

   Alt shortcuts are matched by e.code: on some keyboard layouts Alt+Z types a
   character ("Ω"). Ctrl+T/W/PageUp/PageDown belong to the browser's own tabs,
   hence Alt+T, W, PageUp, PageDown here. A text file dropped on the desktop
   opens in a tab of its own (contribution 'files'). */

import Desk from '../../core/api.js';
import { labels, winButton, hasSheet, mod, sheet, alert, newId } from '../kit.js';
import {
	DEFAULTS, MAX_MATCHES, MAX_MARKS, MAX_WS_MARKS, WS_MARGIN, WS_RE, WS_CLASS,
	cleanDraft, emptyDoc, draftChars, countLines, countWords, countChars, lineCol, pattern as buildPattern,
	findMatches, replacement as literal, isBinary
} from './model.js';

const { h, t, i18n, store } = Desk;
const KEY = 'editor';
/* Above this many characters, words and characters are counted after a pause in typing */
const LAZY_COUNT = 200000;
const LAZY_DELAY = 300;

/** The effective options: DEFAULTS + config.editor (validated by validateConfig) */
const cfg = () => ({ ...DEFAULTS, ...(Desk.modules.config('editor') ?? {}) });

const validateDraft = v => cleanDraft(v, cfg());

function loadDraft() {
	const c = cfg();
	return store.getJson(KEY, validateDraft, null) ?? { tabs: [emptyDoc()], current: null, wrap: c.wrap, ws: c.invisibles };
}

/* The open window: a dropped file goes into the editor through it */
let live = null;

function mount(win, body) {
	const conf = cfg();
	const saved = loadDraft();
	const lb = labels();
	const tabs = [];         // { id, name, dirty, handle, ta } — handle: a FileSystemFileHandle, only while the window lives
	let st = null;           // the current tab
	let ta = null;           // its textarea
	let wrapOn = saved.wrap;
	let wsOn = saved.ws;
	let gutterDirty = true;  // line count or line heights may have changed
	let curLine = null;      // gutter element of the line with the cursor
	let counts = null;       // { lines, words, chars } of the current text (null: count again)
	let staleCounts = null;  // a big text: the last words/characters while typing goes on (LAZY_COUNT)
	let countTimer = 0;
	let draftOk = true;
	let escArmed = false;
	let caseOn = false;
	let regexOn = false;
	let matches = [];
	let current = -1;
	let findError = false;
	let note = '';

	/* ---------- DOM ---------- */

	/* Matches are drawn on a layer behind the (transparent) textarea, since a
	   textarea shows no selection while the search field has focus */
	const hlInner = h('div', { class: 'ed-hl-inner' });
	const hl = h('div', { class: 'ed-hl', 'aria-hidden': 'true' }, hlInner);
	/* Invisible characters, faint on a layer of their own — only the lines in view */
	const wsInner = h('div', { class: 'ed-ws-inner' });
	const ws = h('div', { class: 'ed-ws', 'aria-hidden': 'true', hidden: !wsOn }, wsInner);
	/* Wrap mode: a hidden copy of the text in the same width measures how many
	   rows each line takes, so its number can take the same height */
	const mirror = h('div', { class: 'ed-mirror', 'aria-hidden': 'true' });
	const nums = h('div', { class: 'ed-nums' });
	const gutter = h('div', { class: 'ed-gutter', 'aria-hidden': 'true' }, nums);

	const fInput = h('input', { type: 'text', class: 'ed-input', name: 'find', spellcheck: 'false', autocomplete: 'off' });
	const rInput = h('input', { type: 'text', class: 'ed-input', name: 'replace', spellcheck: 'false', autocomplete: 'off' });
	lb.bind(fInput, 'editor.findField', ['aria-label', 'placeholder']);
	lb.bind(rInput, 'editor.replaceField', ['aria-label', 'placeholder']);
	const fCount = h('span', { class: 'ed-count', 'aria-live': 'polite' });
	const toggle = (text, key, onclick) => lb.bind(h('button', { type: 'button', class: 'ed-toggle', 'aria-pressed': 'false', text, onclick }), key);
	const caseBtn = toggle('Aa', 'editor.matchCase', () => {
		caseOn = !caseOn;
		caseBtn.setAttribute('aria-pressed', String(caseOn));
		scan(true);
	});
	const reBtn = toggle('.*', 'editor.regex', () => {
		regexOn = !regexOn;
		reBtn.setAttribute('aria-pressed', String(regexOn));
		scan(true);
	});
	const smallBtn = (glyph, key, onclick) => lb.bind(h('button', { type: 'button', class: 'ed-btn', onclick }, Desk.icon(glyph)), key);
	const textBtn = (key, onclick) => lb.bind(h('button', { type: 'button', class: 'ed-btn ed-btn-text', onclick }), key, ['text']);

	const findBar = h('div', { class: 'ed-find', role: 'search', hidden: true },
		h('div', { class: 'ed-row' },
			h('label', { class: 'ed-field' }, Desk.icon('ti-search'), fInput, fCount),
			caseBtn, reBtn,
			smallBtn('ti-chevron-up', 'editor.prev', () => go(-1)),
			smallBtn('ti-chevron-down', 'editor.next', () => go(1)),
			smallBtn('ti-x', 'editor.closeFind', closeFind)),
		h('div', { class: 'ed-row' },
			h('label', { class: 'ed-field' }, Desk.icon('ti-arrows-exchange'), rInput),
			textBtn('editor.replace', replaceOne),
			textBtn('editor.replaceAll', replaceAll)));
	lb.bind(findBar, 'editor.find', ['aria-label']);

	const sPos = h('span', { class: 'ed-pos' });
	const sCounts = h('span', { class: 'ed-counts' });
	const sFile = h('span', { class: 'ed-file' });
	const wrapBtn = lb.bind(h('button', { type: 'button', class: 'ed-wrapbtn', 'aria-pressed': String(wrapOn), onclick: () => setWrap(!wrapOn) }),
		'editor.wrap', ['text']);
	lb.bind(wrapBtn, () => t('editor.wrapTitle', { keys: i18n.keys('Alt+Z') }), ['title']);
	const wsBtn = lb.bind(h('button', { type: 'button', class: 'ed-wsbtn', text: '¶', 'aria-pressed': String(wsOn), onclick: () => setWs(!wsOn) }),
		'editor.ws', ['aria-label']);
	lb.bind(wsBtn, () => t('editor.wsTitle', { keys: i18n.keys('Alt+I') }), ['title']);
	const status = h('div', { class: 'ed-status' }, sPos, sCounts, sFile, wsBtn, wrapBtn);

	const measure = h('span', { class: 'ed-measure', 'aria-hidden': 'true', text: 'MMMMMMMMMM' });
	const fileInput = h('input', {
		type: 'file', hidden: true, onchange: () => {
			const file = fileInput.files[0];
			fileInput.value = '';
			if (file) readFile(file, null);
		}
	});

	const wrapBox = h('div', { class: 'ed-wrap' }, hl, ws, mirror, measure);
	const idBase = `${win.id}-ed`;
	const main = h('div', { class: 'ed-main', role: 'tabpanel', id: `${idBase}-panel` }, gutter, wrapBox);
	/* The tablist holds the tabs only; "+" sits beside it in the bar. Each tab's close
	   button is a pointer shortcut (tabindex -1, hidden from assistive technology) —
	   Delete on a tab and Close tab (Alt+W, window menu) do the same from the keyboard */
	const tabList = lb.bind(h('div', { class: 'ed-tablist', role: 'tablist' }), 'editor.tabs', ['aria-label']);
	const addBtn = lb.bind(h('button', { type: 'button', class: 'ed-tab-add', onclick: () => newDoc() }, Desk.icon('ti-plus')), 'editor.newDoc');
	const tabBar = h('div', { class: 'ed-tabs' }, tabList, addBtn);
	const root = h('div', { class: ['ed', wrapOn && 'is-wrap'] }, tabBar, findBar, main, status, fileInput);
	body.append(root);

	win.addActions(
		winButton(win, lb, 'ti-file-plus', 'editor.newDoc', () => newDoc()),
		winButton(win, lb, 'ti-folder-open', 'editor.open', () => openDoc()),
		winButton(win, lb, 'ti-device-floppy', 'editor.save', () => saveDoc(false)),
		winButton(win, lb, 'ti-search', 'editor.find', () => openFind()));

	/* ---------- Rendering ---------- */

	const nameOf = tab => tab.name || t('editor.untitled');

	function renderTitle() {
		win.setTitle(st.dirty ? t('editor.titleEdited', { name: nameOf(st) }) : nameOf(st));
	}

	/* One element per line number; the count follows the text step by step */
	function renderGutter() {
		const v = ta.value;
		const n = countLines(v);
		const kids = nums.children;
		while (kids.length < n) nums.append(h('div', { text: String(kids.length + 1) }));
		while (kids.length > n) nums.lastElementChild.remove();
		gutter.style.setProperty('--digits', String(Math.max(2, String(n).length)));
		if (wrapOn) measureLines(v.split('\n'));
		markLine();
	}

	/* All reads first, then all writes — interleaving would force a layout per line */
	function measureLines(lines) {
		const cs = getComputedStyle(ta);
		const width = ta.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
		mirror.style.width = `${width}px`;
		hlInner.style.width = `${width}px`;
		wsInner.style.width = `${width}px`;
		const rows = mirror.children;
		while (rows.length < lines.length) mirror.append(h('div'));
		while (rows.length > lines.length) mirror.lastElementChild.remove();
		lines.forEach((line, i) => {
			if (rows[i].textContent !== line) rows[i].textContent = line;
		});
		const heights = Array.from(rows, r => `${r.offsetHeight}px`);
		const kids = nums.children;
		heights.forEach((hgt, i) => {
			if (kids[i].style.height !== hgt) kids[i].style.height = hgt;
		});
	}

	function markLine() {
		const el = nums.children[countLines(ta.value.slice(0, ta.selectionStart)) - 1] || null;
		if (el === curLine) return;
		curLine?.classList.remove('is-current');
		el?.classList.add('is-current');
		curLine = el;
	}

	function setWrap(on) {
		wrapOn = on;
		root.classList.toggle('is-wrap', on);
		for (const tab of tabs) tab.ta.setAttribute('wrap', on ? 'soft' : 'off');
		wrapBtn.setAttribute('aria-pressed', String(on));
		if (!on) {
			for (const k of nums.children) k.style.height = '';
			hlInner.style.width = '';
			wsInner.style.width = '';
			mirror.replaceChildren();
		}
		ta.scrollLeft = 0;
		gutterDirty = true;
		wsStale = true;
		refresh();
		renderMarks();
		persist();
	}

	/* A new width re-wraps every line; a new height may bring more lines into view */
	const resizer = new ResizeObserver(() => {
		if (!wrapOn) {
			queueWs();
			return;
		}
		gutterDirty = true;
		wsStale = true;
		refresh();
	});

	/* ---------- Invisible characters ---------- */

	let wsLines = null;  // the text split into lines, null after a change
	let wsFrom = 0;      // lines on the layer: wsFrom … wsTo - 1
	let wsTo = 0;
	let wsTop = 0;       // where line wsFrom starts, measured from the top of the text
	let wsStale = true;  // text, tab, wrap or width changed: draw again even for the same lines

	/* Line at height y of the text: fixed rows, or the wrapped heights of the gutter */
	function lineAt(y, lh, n) {
		if (!wrapOn) return Math.min(n - 1, Math.max(0, Math.floor(y / lh)));
		const kids = nums.children;
		let lo = 0;
		let hi = Math.min(n, kids.length) - 1;
		while (lo < hi) {
			const mid = (lo + hi + 1) >> 1;
			if (kids[mid].offsetTop <= y) lo = mid;
			else hi = mid - 1;
		}
		return Math.max(0, lo);
	}

	/* The text itself stays transparent here; only the marks show */
	function renderWs() {
		/* Wrap mode needs the measured gutter first — the next refresh brings it */
		if (!wsOn || (wrapOn && gutterDirty)) return;
		if (!wsLines) {
			wsLines = ta.value.split('\n');
			wsStale = true;
		}
		const n = wsLines.length;
		const cs = getComputedStyle(ta);
		const lh = parseFloat(cs.lineHeight) || 20;
		const y = Math.max(0, ta.scrollTop - (parseFloat(cs.paddingTop) || 0));
		const first = lineAt(y, lh, n);
		const last = lineAt(y + ta.clientHeight, lh, n) + 1;
		if (!wsStale && first >= wsFrom && last <= wsTo) return;
		wsStale = false;
		wsFrom = Math.max(0, first - WS_MARGIN);
		wsTo = Math.min(n, last + WS_MARGIN);
		wsTop = wrapOn ? (nums.children[wsFrom]?.offsetTop ?? wsFrom * lh) : wsFrom * lh;
		const parts = [];
		let budget = MAX_WS_MARKS;
		for (let i = wsFrom; i < wsTo; i++) {
			const line = wsLines[i];
			let at = 0;
			let m;
			WS_RE.lastIndex = 0;
			while (budget > 0 && (m = WS_RE.exec(line))) {
				if (m.index > at) parts.push(line.slice(at, m.index));
				parts.push(h('span', { class: WS_CLASS[m.findIndex((g, k) => k && g)], text: m[0] }));
				at = m.index + m[0].length;
				budget--;
			}
			if (at < line.length) parts.push(line.slice(at));
			if (i < n - 1) parts.push(h('span', { class: 'ed-ws-n' }), '\n');
		}
		wsInner.replaceChildren(...parts);
		syncWs();
	}

	const syncWs = () => {
		wsInner.style.transform = `translate(${-ta.scrollLeft}px, ${wsTop - ta.scrollTop}px)`;
	};

	let wsRaf = 0;
	const queueWs = () => {
		if (wsOn && !wsRaf) {
			wsRaf = requestAnimationFrame(() => {
				wsRaf = 0;
				renderWs();
			});
		}
	};

	function setWs(on) {
		wsOn = on;
		ws.hidden = !on;
		wsBtn.setAttribute('aria-pressed', String(on));
		wsStale = true;
		if (on) refresh();
		else wsInner.replaceChildren();
		persist();
	}

	/* Lines every frame; words and characters of a big text only after a pause in typing
	   (each is a pass over the whole text — the last numbers stay until then) */
	function countsOf(v) {
		if (v.length <= LAZY_COUNT || !staleCounts) {
			staleCounts = null;
			return { lines: countLines(v), words: countWords(v), chars: countChars(v) };
		}
		clearTimeout(countTimer);
		countTimer = setTimeout(() => {
			countTimer = 0;
			resetCounts();
			if (ta) renderStatus();
		}, LAZY_DELAY);
		return { ...staleCounts, lines: countLines(v) };
	}

	/* Another text (tab, file): count it fully at once */
	function resetCounts() {
		counts = null;
		staleCounts = null;
	}

	function renderStatus() {
		const v = ta.value;
		if (!counts) counts = countsOf(v);
		const { line, col } = lineCol(v, ta.selectionStart);
		const sel = ta.selectionEnd - ta.selectionStart;
		sPos.textContent = sel ? t('editor.positionSel', { line, col, n: sel }) : t('editor.position', { line, col });
		sCounts.textContent = t('editor.counts', {
			lines: t('editor.lines', { n: counts.lines }),
			words: t('editor.words', { n: counts.words }),
			chars: t('core.characters', { n: counts.chars })
		});
		sFile.textContent = note || (draftOk ? nameOf(st) : t('editor.draftFull'));
		sFile.classList.toggle('is-warn', !draftOk && !note);
	}

	let raf = 0;
	const refresh = () => {
		if (raf) return;
		raf = requestAnimationFrame(() => {
			raf = 0;
			if (!ta) return;
			if (gutterDirty) {
				gutterDirty = false;
				renderGutter();
			} else {
				markLine();
			}
			renderWs();
			renderStatus();
		});
	};

	const persist = Desk.dom.debounce(() => {
		draftOk = store.setJson(KEY, {
			tabs: tabs.map(tab => ({ id: tab.id, text: tab.ta.value, name: tab.name, dirty: tab.dirty, pos: tab.ta.selectionStart })),
			current: st?.id ?? null,
			wrap: wrapOn,
			ws: wsOn
		});
		if (ta) renderStatus();
	}, 400);

	/* A short message in the status bar (e.g. "12 replaced") */
	let noteTimer = 0;
	function flash(text) {
		note = text;
		renderStatus();
		clearTimeout(noteTimer);
		noteTimer = setTimeout(() => {
			note = '';
			if (ta) renderStatus();
		}, 2500);
	}

	/* ---------- Editing ---------- */

	function changed() {
		staleCounts = counts ?? staleCounts;
		counts = null;
		gutterDirty = true;
		wsLines = null;
		if (!st.dirty) {
			st.dirty = true;
			renderTitle();
			renderTabs();
		}
		if (!findBar.hidden && fInput.value) scan(false);
		refresh();
		persist();
	}

	/* Insert through execCommand so the browser's undo keeps working */
	function insert(a, b, text) {
		const before = document.activeElement;
		ta.focus({ preventScroll: true });
		ta.setSelectionRange(a, b);
		const ok = text ? document.execCommand('insertText', false, text) : document.execCommand('delete');
		if (!ok) {
			ta.setRangeText(text, a, b, 'end');
			changed();
		}
		if (before && before !== ta && before.isConnected) before.focus({ preventScroll: true });
	}

	const syncScroll = () => {
		nums.style.transform = `translateY(${-ta.scrollTop}px)`;
		hlInner.style.transform = `translate(${-ta.scrollLeft}px, ${-ta.scrollTop}px)`;
		if (wsOn) {
			syncWs();
			queueWs();
		}
	};

	/* Every tab's textarea gets the same listeners; they act on the current one */
	function wire(el) {
		el.addEventListener('input', changed);
		for (const type of ['keyup', 'pointerup', 'select', 'focus']) el.addEventListener(type, refresh);
		el.addEventListener('scroll', syncScroll);
		/* Tab inserts a tab; after Esc it moves the focus on as usual (no keyboard trap) */
		el.addEventListener('keydown', e => {
			if (e.key === 'Escape') {
				escArmed = true;
				return;
			}
			if (e.key === 'Tab' && !escArmed && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
				e.preventDefault();
				insert(ta.selectionStart, ta.selectionEnd, '\t');
			}
			if (!['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) escArmed = false;
		});
	}

	/* ---------- Tabs ---------- */

	const pristine = tab => !tab.ta.value && !tab.name && !tab.dirty;

	/* A new tab right of the current one; restored tabs (doc) keep their order */
	function addTab(doc) {
		if (tabs.length >= conf.maxTabs) {
			flash(t('editor.tooManyTabs', { n: conf.maxTabs }));
			return null;
		}
		const tab = {
			id: doc?.id || newId(), name: doc?.name || null, dirty: !!doc?.dirty, handle: null,
			ta: h('textarea', {
				class: 'ed-text', name: 'document', spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off',
				wrap: wrapOn ? 'soft' : 'off', hidden: true
			})
		};
		tab.ta.value = doc?.text || '';
		if (doc?.pos) tab.ta.setSelectionRange(doc.pos, doc.pos);
		lb.bind(tab.ta, 'editor.text', ['aria-label']);
		wire(tab.ta);
		wrapBox.append(tab.ta);
		if (doc) tabs.push(tab);
		else tabs.splice(st ? tabs.indexOf(st) + 1 : tabs.length, 0, tab);
		return tab;
	}

	function switchTo(tab) {
		if (!tab || tab === st) return;
		if (st) {
			st.ta.hidden = true;
			resizer.unobserve(st.ta);
		}
		st = tab;
		ta = tab.ta;
		ta.hidden = false;
		resizer.observe(ta);
		/* Another text: gutter, mirror and counts start from scratch */
		resetCounts();
		nums.replaceChildren();
		mirror.replaceChildren();
		curLine = null;
		gutterDirty = true;
		wsLines = null;
		syncScroll();
		renderTitle();
		renderTabs();
		if (!findBar.hidden && fInput.value) scan(false);
		else renderMarks();
		refresh();
		persist();
	}

	function renderTabs() {
		const focused = document.activeElement?.closest?.('.ed-tab')?.dataset.id;
		tabList.replaceChildren(...tabs.map(tab => {
			const name = nameOf(tab);
			const isCurrent = tab === st;
			return h('div', { class: ['ed-tab', isCurrent && 'is-current', tab.dirty && 'is-dirty'], dataset: { id: tab.id } },
				h('button', {
					type: 'button', role: 'tab', class: 'ed-tab-btn', id: `${idBase}-${tab.id}`, title: name,
					'aria-label': tab.dirty ? t('editor.titleEdited', { name }) : null,
					'aria-selected': String(isCurrent), 'aria-controls': main.id, 'aria-keyshortcuts': 'Delete', tabindex: isCurrent ? '0' : '-1',
					onclick: () => {
						switchTo(tab);
						ta.focus({ preventScroll: true });
					}
				},
				h('span', { class: 'ed-tab-name', text: name }),
				tab.dirty ? h('span', { class: 'ed-tab-dot', 'aria-hidden': 'true' }) : null),
				h('button', {
					type: 'button', class: 'ed-tab-close', tabindex: '-1', 'aria-hidden': 'true', 'aria-label': t('editor.closeTabNamed', { name }), title: t('editor.closeTab'),
					onclick: () => closeTab(tab)
				}, Desk.icon('ti-x')));
		}));
		main.setAttribute('aria-labelledby', `${idBase}-${st?.id}`);
		if (focused) tabList.querySelector(`.ed-tab[data-id="${Desk.dom.cssEscape(focused)}"] .ed-tab-btn`)?.focus({ preventScroll: true });
	}

	/* A changed tab asks first; the last tab closing leaves a fresh, empty one */
	async function closeTab(tab) {
		if (tab.dirty) {
			switchTo(tab);
			if (!(await confirmDiscard())) return;
		}
		const i = tabs.indexOf(tab);
		if (i < 0) return;
		tabs.splice(i, 1);
		tab.ta.remove();
		resizer.unobserve(tab.ta);
		if (st === tab) {
			st = null;
			switchTo(tabs[Math.min(i, tabs.length - 1)] || addTab());
		} else {
			renderTabs();
			persist();
		}
		ta.focus({ preventScroll: true });
	}

	function stepTab(dir) {
		const i = tabs.indexOf(st);
		switchTo(tabs[(i + dir + tabs.length) % tabs.length]);
	}

	/* Arrow keys walk the tabs (and select them), Delete closes one */
	tabList.addEventListener('keydown', e => {
		const btn = e.target.closest('.ed-tab-btn');
		if (!btn) return;
		const tab = tabs.find(x => `${idBase}-${x.id}` === btn.id);
		const i = tabs.indexOf(tab);
		/* Mirrored for right-to-left languages: → walks towards the end of the line */
		const rtl = getComputedStyle(tabList).direction === 'rtl';
		const fwd = rtl ? 'ArrowLeft' : 'ArrowRight';
		const bwd = rtl ? 'ArrowRight' : 'ArrowLeft';
		const to = { [fwd]: i + 1, [bwd]: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
		if (to !== undefined) {
			e.preventDefault();
			switchTo(tabs[(to + tabs.length) % tabs.length]);
			tabList.querySelector('.ed-tab.is-current .ed-tab-btn')?.focus();
		} else if (e.key === 'Delete') {
			e.preventDefault();
			closeTab(tab);
		}
	});

	/* ---------- Documents and files ---------- */

	/* A whole document into the current tab (a fresh textarea value clears its undo — it is new) */
	function setDoc(text, name, fileHandle) {
		ta.value = text;
		st.name = name;
		st.dirty = false;
		st.handle = fileHandle;
		resetCounts();
		/* A whole new text: start the gutter and the mirror from scratch */
		nums.replaceChildren();
		mirror.replaceChildren();
		curLine = null;
		gutterDirty = true;
		wsLines = null;
		ta.setSelectionRange(0, 0);
		ta.scrollTop = 0;
		ta.scrollLeft = 0;
		renderTitle();
		renderTabs();
		if (fInput.value) scan(false);
		refresh();
		persist();
		persist.flush();
	}

	function markSaved(name) {
		st.name = name;
		st.dirty = false;
		renderTitle();
		renderTabs();
		persist();
		persist.flush();
	}

	/* true when it is fine to replace the document */
	async function confirmDiscard() {
		if (!st.dirty) return true;
		const r = await sheet(win, {
			title: t('editor.askSave', { name: nameOf(st) }),
			text: t('editor.askSaveText'),
			buttons: [
				{ id: 'discard', label: t('editor.discard'), danger: true },
				{ id: 'cancel', label: t('core.cancel') },
				{ id: 'save', label: t('editor.doSave'), primary: true }
			],
			cancel: 'cancel'
		});
		if (r === 'save') return saveDoc(false);
		return r === 'discard';
	}

	function newDoc() {
		/* At the tab limit addTab() only shows a note; the focus still goes back to the text */
		const tab = addTab();
		if (tab) switchTo(tab);
		ta.focus();
	}

	async function readFile(file, fileHandle) {
		if (file.size > conf.maxFileBytes) {
			alert(win, { title: t('editor.tooBig'), text: t('editor.tooBigText', { name: file.name, size: i18n.fmtBytes(conf.maxFileBytes) }) });
			return false;
		}
		let text;
		try {
			text = await file.text();
		} catch {
			alert(win, { title: t('editor.readError'), text: file.name });
			return false;
		}
		if (isBinary(text)) {
			alert(win, { title: t('editor.notText'), text: t('editor.notTextText', { name: file.name }) });
			return false;
		}
		/* An empty, unnamed tab takes the file; otherwise it gets a tab of its own */
		if (!pristine(st)) {
			const tab = addTab();
			if (!tab) return false;
			switchTo(tab);
		}
		setDoc(text, file.name, fileHandle);
		ta.focus();
		return true;
	}

	/* The browser's real file dialog where it exists (Save writes back into the same file);
	   otherwise a file input — Save then downloads the text */
	async function openDoc() {
		if (typeof window.showOpenFilePicker === 'function') {
			try {
				const [fh] = await window.showOpenFilePicker();
				await readFile(await fh.getFile(), fh);
			} catch (err) {
				if (err?.name !== 'AbortError') alert(win, { title: t('editor.readError'), text: err?.message ?? '' });
			}
		} else {
			fileInput.click();
		}
	}

	async function write(fh, text) {
		const w = await fh.createWritable();
		await w.write(text);
		await w.close();
	}

	async function saveDoc(as) {
		const text = ta.value;
		const name = st.name || `${t('editor.untitled')}.txt`;
		try {
			if (st.handle && !as) {
				await write(st.handle, text);
				markSaved(st.handle.name);
				return true;
			}
			if (typeof window.showSaveFilePicker === 'function') {
				const fh = await window.showSaveFilePicker({ suggestedName: name });
				await write(fh, text);
				st.handle = fh;
				markSaved(fh.name);
				return true;
			}
		} catch (err) {
			if (err?.name !== 'AbortError') alert(win, { title: t('editor.writeError'), text: err?.message ?? '' });
			return false;
		}
		Desk.dom.saveFile(text, name, 'text/plain;charset=utf-8');
		markSaved(name);
		return true;
	}

	/* ---------- Find and replace ---------- */

	let charWidth = 0;
	function reveal(pos) {
		const v = ta.value;
		const cs = getComputedStyle(ta);
		const lh = parseFloat(cs.lineHeight) || 20;
		const pad = parseFloat(cs.paddingTop) || 0;
		if (!charWidth) charWidth = measure.getBoundingClientRect().width / 10 || 8;
		const line = countLines(v.slice(0, pos)) - 1;
		const start = v.lastIndexOf('\n', pos - 1) + 1;
		const col = pos - start;
		let top = pad + line * lh;
		if (wrapOn) {
			/* Top of the line plus the rows the text before pos fills inside it */
			const probe = h('div', { text: v.slice(start, pos) });
			mirror.append(probe);
			top = pad + (nums.children[line]?.offsetTop ?? line * lh) + Math.max(0, probe.offsetHeight - lh);
			probe.remove();
		}
		if (top < ta.scrollTop || top + lh > ta.scrollTop + ta.clientHeight) ta.scrollTop = Math.max(0, top - ta.clientHeight / 3);
		if (wrapOn) return;
		const x = col * charWidth;
		if (x < ta.scrollLeft || x > ta.scrollLeft + ta.clientWidth - 60) ta.scrollLeft = Math.max(0, x - ta.clientWidth / 3);
	}

	const pattern = () => buildPattern(fInput.value, { regex: regexOn, matchCase: caseOn });

	/* select: jump to the first match at or after the cursor */
	function scan(select) {
		const re = pattern();
		findError = re === undefined;
		matches = [];
		current = -1;
		fInput.setAttribute('aria-invalid', String(findError));
		if (re) {
			matches = findMatches(ta.value, re, MAX_MATCHES);
			const s = ta.selectionStart;
			const e = ta.selectionEnd;
			current = matches.findIndex(([a, b]) => a === s && b === e);
		}
		if (select && matches.length) {
			const from = ta.selectionStart;
			const i = matches.findIndex(([a]) => a >= from);
			pick(i === -1 ? 0 : i);
		} else {
			renderCount();
		}
	}

	function renderMarks() {
		if (findBar.hidden || !matches.length) {
			hlInner.replaceChildren();
			return;
		}
		const v = ta.value;
		const parts = [];
		let at = 0;
		matches.slice(0, MAX_MARKS).forEach(([a, b], i) => {
			parts.push(v.slice(at, a), h('mark', { class: i === current ? 'is-current' : null, text: v.slice(a, b) }));
			at = b;
		});
		hlInner.replaceChildren(...parts);
	}

	function renderCount() {
		renderMarks();
		if (findError) fCount.textContent = t('editor.badRegex');
		else if (!fInput.value) fCount.textContent = '';
		else if (!matches.length) fCount.textContent = t('editor.noMatch');
		else fCount.textContent = t('editor.matchOf', { current: current < 0 ? '–' : current + 1, total: matches.length });
		fCount.classList.toggle('is-warn', findError || (!!fInput.value && !matches.length));
	}

	function pick(i) {
		current = i;
		const [a, b] = matches[i];
		ta.setSelectionRange(a, b);
		reveal(a);
		renderCount();
		refresh();
	}

	function go(dir) {
		if (!fInput.value) {
			openFind();
			return;
		}
		if (!matches.length) scan(false);
		if (!matches.length) return;
		let i;
		if (dir > 0) {
			i = matches.findIndex(([a]) => a >= ta.selectionEnd);
			if (i === -1) i = 0;
		} else {
			i = matches.findLastIndex(([a]) => a < ta.selectionStart);
			if (i === -1) i = matches.length - 1;
		}
		pick(i);
	}

	function replaceOne() {
		const re = pattern();
		if (!re) return;
		const s = ta.selectionStart;
		const e = ta.selectionEnd;
		const hit = matches.find(([a, b]) => a === s && b === e);
		if (!hit) {
			go(1);
			return;
		}
		const single = new RegExp(re.source, re.flags.replace('g', ''));
		const out = ta.value.slice(s, e).replace(single, literal(rInput.value, regexOn));
		insert(s, e, out);
		scan(false);
		ta.setSelectionRange(s + out.length, s + out.length);
		go(1);
	}

	function replaceAll() {
		const re = pattern();
		if (!re) return;
		scan(false);
		const n = matches.length;
		if (!n) return;
		const out = ta.value.replace(re, literal(rInput.value, regexOn));
		const keep = ta.scrollTop;
		insert(0, ta.value.length, out);
		ta.setSelectionRange(0, 0);
		ta.scrollTop = keep;
		scan(false);
		flash(t('editor.replaced', { n }));
	}

	function openFind() {
		findBar.hidden = false;
		const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd);
		if (sel && !sel.includes('\n')) fInput.value = sel;
		fInput.focus();
		fInput.select();
		scan(false);
	}

	function closeFind() {
		findBar.hidden = true;
		renderMarks();
		ta.focus({ preventScroll: true });
	}

	fInput.addEventListener('input', () => scan(true));
	fInput.addEventListener('keydown', e => {
		if (e.key === 'Enter') {
			e.preventDefault();
			go(e.shiftKey ? -1 : 1);
		} else if (e.key === 'Escape') {
			e.preventDefault();
			closeFind();
		}
	});
	rInput.addEventListener('keydown', e => {
		if (e.key === 'Enter') {
			e.preventDefault();
			if (mod(e)) replaceAll();
			else replaceOne();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			closeFind();
		}
	});

	/* ---------- Shortcuts (only while this window has focus) ---------- */

	win.el.addEventListener('keydown', e => {
		if (hasSheet(win)) return;
		if (e.altKey && !e.ctrlKey && !e.metaKey) {
			const act = {
				KeyZ: () => setWrap(!wrapOn), KeyI: () => setWs(!wsOn), KeyT: newDoc, KeyW: () => closeTab(st),
				PageDown: () => stepTab(1), PageUp: () => stepTab(-1)
			}[e.code];
			if (act) {
				e.preventDefault();
				act();
				return;
			}
		}
		if (!mod(e)) return;
		const k = e.key.toLowerCase();
		if (k === 's') {
			e.preventDefault();
			saveDoc(e.shiftKey);
		} else if (k === 'o') {
			e.preventDefault();
			openDoc();
		} else if (k === 'f') {
			e.preventDefault();
			openFind();
		} else if (k === 'g') {
			e.preventDefault();
			go(e.shiftKey ? -1 : 1);
		}
	});

	/* ---------- Closing the window ---------- */

	/* The draft keeps every tab, so closing loses nothing — unless the browser could not
	   store it (storage full or blocked): then changed documents are saved first or given up */
	function beforeClose() {
		persist();
		persist.flush();
		const dirty = tabs.filter(tab => tab.dirty);
		if (draftOk || !dirty.length) return true;
		return (async () => {
			const r = await sheet(win, {
				title: t('editor.askClose', { n: dirty.length }),
				text: t('editor.askCloseText'),
				buttons: [
					{ id: 'discard', label: t('editor.discard'), danger: true },
					{ id: 'cancel', label: t('core.cancel') },
					{ id: 'save', label: t('editor.doSave'), primary: true }
				],
				cancel: 'cancel'
			});
			if (r === 'discard') return true;
			if (r !== 'save') return false;
			for (const tab of dirty) {
				if (!tabs.includes(tab)) continue;
				switchTo(tab);
				if (!(await saveDoc(false))) return false;
			}
			return true;
		})();
	}

	live = { openFile: file => readFile(file, null) };

	win.state.editor = {
		first: true, persist, lb, reveal, resizer, renderTitle, renderStatus, renderCount, renderTabs, beforeClose,
		get ta() { return ta; },
		menu: () => [
			{ label: t('editor.newDoc'), shortcut: 'Alt+T', run: newDoc },
			{ label: t('editor.open'), shortcut: 'Mod+O', run: openDoc },
			'-',
			{ label: t('editor.closeTab'), shortcut: 'Alt+W', run: () => closeTab(st) },
			{ label: t('editor.nextTab'), shortcut: 'Alt+PageDown', disabled: tabs.length < 2, run: () => stepTab(1) },
			{ label: t('editor.prevTab'), shortcut: 'Alt+PageUp', disabled: tabs.length < 2, run: () => stepTab(-1) },
			'-',
			{ label: t('editor.save'), shortcut: 'Mod+S', run: () => saveDoc(false) },
			{ label: t('editor.saveAs'), shortcut: 'Mod+Shift+S', run: () => saveDoc(true) },
			'-',
			{ label: t('editor.find'), shortcut: 'Mod+F', run: openFind },
			{ label: t('editor.wrapMenu'), shortcut: 'Alt+Z', checkbox: true, checked: wrapOn, run: () => setWrap(!wrapOn) },
			{ label: t('editor.ws'), shortcut: 'Alt+I', checkbox: true, checked: wsOn, run: () => setWs(!wsOn) }
		],
		close() {
			resizer.disconnect();
			cancelAnimationFrame(raf);
			cancelAnimationFrame(wsRaf);
			clearTimeout(noteTimer);
			clearTimeout(countTimer);
			persist();
			persist.flush();
			ta = null;
		}
	};

	for (const doc of saved.tabs) addTab(doc);
	switchTo(tabs.find(tab => tab.id === saved.current) || tabs[0]);
}

export default {
	id: 'editor',
	kind: 'app',
	i18n: ['editor'],
	styles: ['editor.css'],

	app: { icon: 'ti-file-text', tint: 'blue', size: [820, 560], name: '@editor.appName', desc: '@editor.appDesc' },

	storage: {
		editor: {
			type: 'json', backup: true, reset: 'editor', label: '@editor.draftLabel', validate: validateDraft,
			/* "1,234 characters" — a ready text for the backup and reset summaries */
			count: v => {
				const n = draftChars(v);
				return n ? t('core.characters', { n }) : 0;
			}
		}
	},
	resetGroups: [{ id: 'editor', label: '@editor.draftLabel', hint: '@editor.resetHint', order: 50 }],

	/* A text file dropped on the desktop: a tab of its own (the shell decides what counts as text) */
	files: {
		text: {
			label: '@editor.dropLabel',
			icon: 'ti-file-text',
			order: 50,
			async open(file) {
				Desk.launch('editor');
				return live ? live.openFile(file) : false;
			}
		}
	},

	/* Optional config section editor: { maxTabs, maxFileBytes, wrap, invisibles } */
	configKey: 'editor',
	validateConfig(section, warn) {
		const out = {};
		if (!section || typeof section !== 'object' || Array.isArray(section)) {
			if (section != null) warn('must be an object — using the defaults');
			return out;
		}
		const int = (k, min, max) => {
			if (section[k] === undefined) return;
			if (Number.isInteger(section[k]) && section[k] >= min && section[k] <= max) out[k] = section[k];
			else warn(`${k} must be an integer ${min}–${max} — using ${DEFAULTS[k]}`);
		};
		const bool = k => {
			if (section[k] === undefined) return;
			if (typeof section[k] === 'boolean') out[k] = section[k];
			else warn(`${k} must be true or false — using ${DEFAULTS[k]}`);
		};
		int('maxTabs', 1, 100);
		int('maxFileBytes', 1024, 50 * 1024 * 1024);
		bool('wrap');
		bool('invisibles');
		return out;
	},

	mount,

	focus(win) {
		const ed = win.state.editor;
		if (!ed?.ta) return;
		const a = document.activeElement;
		if (win.el.contains(a) && a !== win.el) return;
		ed.ta.focus({ preventScroll: true });
		if (ed.first) {
			/* First open: bring the restored cursor into view once the window has its size */
			ed.first = false;
			requestAnimationFrame(() => { if (ed.ta) ed.reveal(ed.ta.selectionStart); });
		}
	},

	menu: win => win.state.editor?.menu() ?? [],

	relabel(win) {
		const ed = win.state.editor;
		ed.lb.apply();
		ed.renderTitle();
		ed.renderTabs();
		ed.renderStatus();
		ed.renderCount();
	},

	beforeClose: win => win.state.editor?.beforeClose() ?? true,

	unmount(win) {
		win.state.editor?.close();
		live = null;
	}
};
