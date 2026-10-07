/* JPKCom Desktop — Calculator app: point before line, percent, history, keyboard — © Jean Pierre Kolb — MIT License

   A basic calculator. The arithmetic lives in engine.js (pure, no eval); this
   file draws the always-dark keypad (a dark island), keeps the last
   calculations in storage key 'calc' ({ history: [{ e, r }] }) and maps the
   keyboard: digits (also the language's own digits), + - * / (x and : as well), Enter/=, , or . for the
   decimal separator, % , Backspace, Esc/Del/C to clear, F9 to change the sign.
   Ctrl/⌘+C without a text selection copies the result. */

import Desk from '../../core/api.js';
import { labels, winButton, hasSheet, mod, copyWithFeedback } from '../kit.js';
import { HISTORY, isOp, canonical, formatNum, formatExpr, cleanCalc, createCalc, keepLast } from './engine.js';

const { h, t, i18n, store } = Desk;
const KEY = 'calc';

/* config.calc.historySize (optional section; the default keeps 50) */
const cfg = () => Desk.modules.config('calc') ?? {};
const historySize = () => cfg().historySize ?? HISTORY;

/* The language's number formatting for the engine */
const numFmt = () => ({
	int: n => i18n.fmtNumber(n),
	sci: n => i18n.fmtNumber(n, { notation: 'scientific', maximumFractionDigits: 8 }),
	digit: d => i18n.fmtNumber(d, { useGrouping: false }),
	decimal: i18n.decimalSep()
});

/* The digits 0–9 as the language writes them ('٠'…'٩' in Arabic, '0'…'9' in most) */
const digitLabels = () => Array.from({ length: 10 }, (_, d) => i18n.fmtNumber(d, { useGrouping: false }));

const load = () => store.getJson(KEY, v => cleanCalc(v, historySize()), null) ?? { history: [] };

const KEYMAP = { Enter: '=', '=': '=', ',': 'dec', '.': 'dec', Backspace: 'back', Escape: 'clear', Delete: 'clear', '%': 'percent',
	x: '*', X: '*', ':': '/', c: 'clear', C: 'clear', F9: 'neg' };

function mount(win, body) {
	let data = load();
	const calc = createCalc();
	const lb = labels();

	const exprEl = h('div', { class: 'calc-expr', 'aria-hidden': 'true' });
	const valueEl = h('output', { class: 'calc-value', 'aria-live': 'polite' });
	lb.bind(valueEl, 'calc.display', ['aria-label']);
	const display = h('div', { class: 'calc-display' }, exprEl, valueEl);

	const key = (label, k, cls, aria) => {
		const b = h('button', { type: 'button', class: ['calc-key', cls], dataset: { key: k }, text: label });
		if (aria) lb.bind(b, `calc.${aria}`, ['aria-label']);
		return b;
	};
	const clearKey = key('AC', 'clear', 'is-fn');
	const decKey = key(i18n.decimalSep(), 'dec', 'is-num', 'dec');
	/* Digit keys keep ASCII data-key values; their labels follow the language (render()) */
	const digitKeys = [];
	const num = (d, cls = 'is-num') => (digitKeys[d] = key(String(d), String(d), cls));
	const keypad = h('div', { class: 'calc-keys', role: 'group' },
		clearKey, key('±', 'neg', 'is-fn', 'neg'), key('%', 'percent', 'is-fn', 'percent'), key('÷', '/', 'is-op', 'div'),
		num(7), num(8), num(9), key('×', '*', 'is-op', 'mul'),
		num(4), num(5), num(6), key('−', '-', 'is-op', 'sub'),
		num(1), num(2), num(3), key('+', '+', 'is-op', 'add'),
		num(0, 'is-num is-zero'), decKey, key('=', '=', 'is-op is-eq', 'eq'));
	lb.bind(keypad, 'calc.keypad', ['aria-label']);

	const histList = h('ul', { class: 'calc-hist-list' });
	const histClear = lb.bind(h('button', { type: 'button', class: 'btn' }), 'calc.clearHistory', ['text']);
	const histTitle = lb.bind(h('h3', { tabindex: '-1' }), 'calc.history', ['text']);
	const hist = h('div', { class: 'calc-hist', hidden: true }, histTitle, histList, histClear);
	body.append(h('div', { class: 'calc', dataset: { island: 'dark' } }, display, keypad, hist));

	const copyBtn = winButton(win, lb, 'ti-copy', 'calc.copy', () => copy(), 'calc-copy');
	const histBtn = winButton(win, lb, 'ti-history', 'calc.history', () => toggleHistory());
	histBtn.setAttribute('aria-expanded', 'false');
	win.addActions(copyBtn, histBtn);

	/* ---------- Drawing ---------- */

	function render() {
		const fmt = numFmt();
		const v = calc.view();
		decKey.textContent = fmt.decimal;
		digitLabels().forEach((label, d) => { digitKeys[d].textContent = label; });
		clearKey.textContent = v.clear === 'c' ? 'C' : 'AC';
		clearKey.setAttribute('aria-label', t(v.clear === 'c' ? 'calc.c' : 'calc.ac'));
		const expr = v.expr ? formatExpr(v.expr, fmt) : '';
		exprEl.textContent = v.done ? `${expr} =` : expr;
		valueEl.textContent = v.value === null ? t('calc.error') : formatNum(v.value, fmt);
		/* Long numbers shrink to fit (44px for up to nine characters) */
		const len = valueEl.textContent.length;
		valueEl.style.fontSize = len > 9 ? `${Math.max(16, Math.floor((44 * 9) / len))}px` : '';
		for (const b of keypad.querySelectorAll('.is-op')) b.classList.toggle('is-active', b.dataset.key === v.pending);
	}

	function save() {
		if (!store.setJson(KEY, data)) Desk.announce(t('core.storageFull'), { assertive: true });
	}

	function press(k) {
		const { result } = calc.press(k);
		if (result) {
			data.history.push(result);
			data.history = keepLast(data.history, historySize());
			save();
			renderHistory();
		}
		render();
	}

	/* ---------- History ---------- */

	function renderHistory() {
		const fmt = numFmt();
		histList.replaceChildren(...[...data.history].reverse().map(x => {
			const result = formatNum(canonical(x.r), fmt);
			return h('li', {},
				h('button', { type: 'button', class: 'calc-hist-item', dataset: { r: String(x.r) }, 'aria-label': t('calc.reuse', { value: result }) },
					h('span', { class: 'calc-hist-expr', text: `${formatExpr(x.e.split(' '), fmt)} =` }),
					h('span', { class: 'calc-hist-result', text: result })));
		}));
		if (!data.history.length) histList.append(h('li', { class: 'calc-hist-empty', text: t('calc.noHistory') }));
		histClear.disabled = !data.history.length;
	}

	function toggleHistory(show = hist.hidden) {
		hist.hidden = !show;
		histBtn.setAttribute('aria-expanded', String(show));
		if (show) {
			renderHistory();
			(histList.querySelector('button') || histClear).focus();
		} else {
			win.el.focus({ preventScroll: true });
		}
	}

	histList.addEventListener('click', e => {
		const b = e.target.closest('.calc-hist-item');
		if (!b) return;
		calc.load(Number(b.dataset.r));
		toggleHistory(false);
		render();
	});
	histClear.addEventListener('click', () => {
		data.history = [];
		save();
		renderHistory();
		/* The focused button is disabled now: keep the focus inside the history */
		histTitle.focus({ preventScroll: true });
	});

	async function copy() {
		const v = calc.view();
		if (v.value === null) return;
		await copyWithFeedback(copyBtn, formatNum(v.value, numFmt()), { key: 'calc.copy', doneKey: 'calc.copied' });
	}

	/* ---------- Input ---------- */

	keypad.addEventListener('click', e => {
		const b = e.target.closest('.calc-key');
		if (b) press(b.dataset.key);
	});

	win.el.addEventListener('keydown', e => {
		if (hasSheet(win) || e.ctrlKey || e.metaKey || e.altKey) {
			if (mod(e) && e.key.toLowerCase() === 'c' && !getSelection().toString()) copy();
			return;
		}
		if (!hist.hidden) {
			if (e.key === 'Escape') {
				e.preventDefault();
				toggleHistory(false);
			}
			return;
		}
		/* A focused control (a keypad key, the title-bar buttons Close, Copy, History …)
		   reacts to Enter and Space itself — only other keys go to the calculator */
		if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('button, a[href], input, select, textarea, summary')) return;
		const native = e.key.length === 1 && !/[0-9]/.test(e.key) ? digitLabels().indexOf(e.key) : -1;
		const k = /^[0-9]$/.test(e.key) || isOp(e.key) ? e.key : native >= 0 ? String(native) : KEYMAP[e.key];
		if (!k) return;
		e.preventDefault();
		press(k);
		const btn = keypad.querySelector(`[data-key="${Desk.dom.cssEscape(k === 'back' ? 'clear' : k)}"]`);
		if (btn && !Desk.reduceMotion()) {
			btn.classList.add('is-pressed');
			setTimeout(() => btn.classList.remove('is-pressed'), 120);
		}
	});

	/* Another tab of the desktop calculated (or a backup came back): the history follows */
	const offStore = Desk.on('store:change', ({ name, external } = {}) => {
		if (name !== KEY || !external) return;
		data = load();
		if (!hist.hidden) renderHistory();
	});
	const offRestore = Desk.on('storage:restore', ({ names } = {}) => {
		if (!names?.includes(KEY)) return;
		data = load();
		renderHistory();
	});

	const offReset = Desk.on('storage:reset', ({ groups } = {}) => {
		if (!groups?.includes('calc')) return;
		data = load();
		renderHistory();
	});

	win.state.calc = { lb, render, renderHistory, off: () => { offStore(); offRestore(); offReset(); } };
	render();
	renderHistory();
}

export default {
	id: 'calc',
	kind: 'app',
	i18n: ['calc'],
	styles: ['calc.css'],

	app: { icon: 'ti-calculator', tint: 'black', size: [300, 470], fixed: true, name: '@calc.appName', desc: '@calc.appDesc' },

	storage: {
		calc: { type: 'json', backup: true, reset: 'calc', label: '@calc.historyLabel',
			validate: v => cleanCalc(v, historySize()), count: v => v.history.length }
	},
	resetGroups: [{ id: 'calc', label: '@calc.historyLabel', hint: '@calc.resetHint', order: 55 }],

	/* Optional config section calc: { historySize } */
	configKey: 'calc',
	validateConfig(section, warn) {
		const out = {};
		if (section && typeof section === 'object' && section.historySize !== undefined) {
			if (Number.isInteger(section.historySize) && section.historySize >= 0 && section.historySize <= 500) out.historySize = section.historySize;
			else warn(`historySize must be an integer 0–500 — using ${HISTORY}`);
		}
		return out;
	},

	mount,

	relabel(win) {
		const c = win.state.calc;
		c.lb.apply();
		c.render();
		c.renderHistory();
	},

	unmount(win) {
		win.state.calc?.off();
	}
};
