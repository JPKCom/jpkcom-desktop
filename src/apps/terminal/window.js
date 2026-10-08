/* JPKCom Desktop — Terminal app: the window and the built-in commands (loaded when it first opens) — © Jean Pierre Kolb — MIT License

   The output log, the prompt line, the io given to commands (index.js has the
   contract), Tab completion and the keys. Importing this file registers the
   built-in commands (commands/*.js) into the registry of index.js, whose
   setup() reserved their names. win.state.term is the open window's handle.

   Keys: Enter runs, ↑/↓ walk the history, Tab completes commands and their
   arguments (on an empty line Tab leaves the terminal — no keyboard trap),
   Ctrl/⌘+L clears, Ctrl/⌘+C cancels the line (or a running command),
   Ctrl/⌘+U empties the line. */

import Desk from '../../core/api.js';
import { mod } from '../kit.js';
import { parse, fold, nearest, completeLine, pushHistory, historyLine, markdownRows } from './lib.js';
import { KEY, DNS, ORDER, commands, config, dnsOn, historySize, load, save } from './index.js';
import coreCommands from './commands/core.js';
import fsCommands from './commands/fs.js';
import sysCommands from './commands/sys.js';
import browserCommands from './commands/browser.js';
import storageCommands from './commands/storage.js';
import netCommands from './commands/net.js';
import eggCommands from './commands/eggs.js';

const { h, t: tr } = Desk;
const t = (key, params) => tr(`terminal.${key}`, params);

/* ---------- Built-in commands ---------- */

/* Into the places setup() reserved (help order); the eggs are weak — a real command of their name wins */
function registerBuiltins() {
	const cfg = config();
	const all = {
		...coreCommands, ...fsCommands(cfg), ...sysCommands, ...browserCommands, ...storageCommands,
		...(dnsOn() ? netCommands(cfg.doh, DNS) : {})
	};
	for (const name of [...ORDER, ...Object.keys(all).filter(n => !ORDER.includes(n))]) {
		if (all[name]) commands.register(name, all[name], { source: 'builtin' });
	}
	if (cfg.eggs) for (const [name, def] of Object.entries(eggCommands)) commands.register(name, def, { source: 'builtin', weak: true });
}

registerBuiltins();

/* ---------- The window ---------- */

function mount(win, body) {
	let state = load();
	let histPos = state.history.length;
	let draft = '';
	let busy = false;
	let closing = false;
	let cwd = '';
	let current = null;          // AbortController of the running command
	const asks = new Set();      // open readLine() questions (answered null on close)

	const user = () => Desk.vault?.user?.() || config().user;
	const host = () => Desk.config.brand.host || location.hostname || 'localhost';
	const path = () => (cwd ? `~/${cwd}` : '~');

	const out = h('div', { class: 'term-out', role: 'log', 'aria-live': 'polite' });
	const prompt = () => h('span', { class: 'term-prompt', 'aria-hidden': 'true' },
		h('span', { class: 'term-user', text: `${user()}@${host()}` }), ':', h('span', { class: 'term-path', text: path() }), '$ ');
	const input = h('input', {
		type: 'text', class: 'term-input', name: 'command', autocomplete: 'off', autocapitalize: 'off',
		spellcheck: 'false', enterkeyhint: 'send'
	});
	const line = h('div', { class: 'term-line' }, prompt(), input);
	/* A terminal is code-like: always left to right (prompt, cal grid, ASCII art, columns), as the
	   editor's text; words of a right-to-left language inside a row still read right to left (bidi) */
	const scroller = h('div', { class: 'term', tabindex: '-1', dir: 'ltr', dataset: { island: 'dark' } }, out, line);
	body.append(scroller);

	function labels() {
		out.setAttribute('aria-label', t('output'));
		input.setAttribute('aria-label', t('input'));
	}

	const refreshPrompt = () => line.firstChild.replaceWith(prompt());

	/* ---------- Output ---------- */

	const bottom = () => { scroller.scrollTop = scroller.scrollHeight; };

	/* An io for one command: after Ctrl+C (signal aborted) its late output is dropped */
	function makeIo(signal = null) {
		const live = () => !signal?.aborted && !closing;

		function print(nodes, cls) {
			const row = h('div', { class: ['term-row', cls] }, nodes);
			if (!live()) return row;
			out.append(row);
			bottom();
			return row;
		}

		const say = (text, cls) => print(Array.isArray(text) ? text : [text == null ? '' : String(text)], cls);

		function table(rows, opts = {}) {
			const { gap = 2, wrap = false } = typeof opts === 'number' ? { gap: opts } : opts ?? {};
			if (!Array.isArray(rows) || !rows.length) return;
			const width = Math.max(...rows.map(r => String(r[0] ?? '').length)) + gap;
			for (const [a, b] of rows) {
				const row = print([h('span', { class: 'term-key', text: String(a ?? '').padEnd(width) }), b ?? ''], wrap ? 'term-kv' : 'term-pre');
				if (wrap) row.style.setProperty('--kv', `${width}ch`);
			}
		}

		/* https or a path on this site; a plain click opens it inside the desktop */
		function link(text, href, base) {
			const url = Desk.router.resolveUrl(href, base ?? Desk.env.root);
			if (!url || !/^https?:$/.test(url.protocol) || (url.protocol === 'http:' && Desk.router.isExternal(url))) return document.createTextNode(text);
			const ext = Desk.router.isExternal(url);
			return h('a', {
				class: 'term-link', href: url.href, text, target: ext ? '_blank' : null, rel: ext ? 'noopener noreferrer' : null,
				onclick: e => {
					if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
					e.preventDefault();
					Desk.openUrl(url.href);
				}
			});
		}

		function markdown(text, base) {
			for (const row of markdownRows(text)) {
				print(row.parts.map(p => (p.t === 'b' ? h('b', { text: p.text })
					: p.t === 'code' ? h('code', { class: 'term-code', text: p.text })
						: p.t === 'link' ? link(p.text, p.href, base)
							: p.text)), row.cls);
			}
		}

		/* A "loading" row that the result replaces */
		function progress(text) {
			const note = h('div', { class: 'term-row term-dim', text });
			if (live()) {
				out.append(note);
				bottom();
			}
			return () => note.remove();
		}

		return Object.freeze({
			print, say, table, link, markdown, progress, win, signal,
			/* Bound to this command: once it was cancelled it gets no new question,
			   and an open one is answered null when Ctrl+C comes */
			readLine: (label, opts) => (live() ? readLine(label, opts, signal) : Promise.resolve(null)),
			err: text => say(text, 'term-err'),
			dim: text => say(text, 'term-dim'),
			heading: text => say(text, 'term-h'),
			blank: () => say(''),
			clear,
			cols() {
				const fs = parseFloat(getComputedStyle(scroller).fontSize) || 13;
				return Math.max(20, Math.floor((scroller.clientWidth - 30) / (fs * 0.6)));
			}
		});
	}

	const io = makeIo();

	function echo(text) {
		io.print([prompt(), text]);
	}

	function clear() {
		out.replaceChildren();
	}

	/* One line of input inside a running command: an own field under the output
	   (the prompt line stays hidden). Esc, Ctrl + C or the command's aborted signal cancel → null */
	function readLine(label, opts = {}, signal = null) {
		const secret = opts === true || opts?.secret === true;
		if (signal?.aborted || closing) return Promise.resolve(null);
		return new Promise(done => {
			const text = String(label ?? '');
			const field = h('input', {
				type: secret ? 'password' : 'text', class: 'term-input', autocomplete: secret ? 'current-password' : 'off', autocapitalize: 'off',
				spellcheck: 'false', enterkeyhint: 'send', 'aria-label': text.replace(/[:?]\s*(\[[^\]]*\])?\s*$/, '').trim() || text
			});
			const tag = () => h('span', { class: 'term-prompt', 'aria-hidden': 'true', text: `${text} ` });
			const row = h('div', { class: 'term-line term-ask' }, tag(), field);
			scroller.insertBefore(row, line);
			const onAbort = () => finish(null);
			const finish = value => {
				if (!asks.delete(finish)) return;
				signal?.removeEventListener('abort', onAbort);
				row.remove();
				/* A password never reaches the output, not even as dots */
				if (!closing) io.print([tag(), secret || value == null ? '' : value, value == null ? h('span', { class: 'term-dim', text: '^C' }) : null]);
				done(value);
			};
			asks.add(finish);
			signal?.addEventListener('abort', onAbort, { once: true });
			field.addEventListener('keydown', e => {
				if (e.isComposing) return;
				if (e.key === 'Enter') {
					e.preventDefault();
					finish(field.value);
				} else if (e.key === 'Escape' || (mod(e) && e.key.toLowerCase() === 'c' && !getSelection().toString())) {
					e.preventDefault();
					e.stopPropagation();
					finish(null);
				}
			});
			bottom();
			field.focus({ preventScroll: true });
		});
	}

	function wobble() {
		if (Desk.reduceMotion()) return;
		win.el.classList.remove('term-shake');
		void win.el.offsetWidth;
		win.el.classList.add('term-shake');
		setTimeout(() => win.el.classList.remove('term-shake'), 500);
	}

	const shell = Object.freeze({
		cwd: () => cwd,
		cd(dir) {
			cwd = dir || '';
			refreshPrompt();
		},
		user,
		host,
		history: () => [...state.history],
		clearHistory,
		commands,
		close() {
			closing = true;
			setTimeout(() => Desk.close(win), 400);
		},
		shake: wobble
	});

	function clearHistory() {
		state = { ...state, history: [] };
		histPos = 0;
		save(state);
		io.dim(t('histCleared'));
	}

	/* ---------- Running a line ---------- */

	async function run(lineText) {
		const text = lineText.trim();
		if (!text) {
			echo(lineText);
			return;
		}
		/* Look the command up first: a sensitive one (login) keeps its arguments
		   out of the history, the backup and the echo */
		const [name = '', ...args] = parse(text);
		const cmd = fold(name);
		const entry = commands.get(cmd);
		echo(entry?.def.sensitive && args.length ? `${name} …` : lineText);
		state = pushHistory(state, historyLine(text, entry), historySize());
		save(state);
		histPos = state.history.length;
		if (!entry) {
			io.err(t('notFound', { name }));
			const near = nearest(cmd, commands.names());
			if (near) io.dim(t('didYouMean', { name: near }));
			return;
		}
		const ctl = new AbortController();
		current = ctl;
		busy = true;
		const hadFocus = document.activeElement === input;
		line.hidden = true;
		if (hadFocus) scroller.focus({ preventScroll: true });
		const ctx = Object.freeze({ name: entry.name, rest: text.replace(/^\S+\s*/, ''), line: text, shell });
		const cmdIo = makeIo(ctl.signal);
		const cancelled = new Promise(done => ctl.signal.addEventListener('abort', done, { once: true }));
		try {
			await Promise.race([Promise.resolve().then(() => entry.def.run(args, cmdIo, ctx)), cancelled]);
		} catch (e) {
			if (!ctl.signal.aborted) cmdIo.err(String(e?.message || e));
		} finally {
			if (current === ctl) current = null;
			if (win.el.isConnected && !closing) {
				busy = false;
				line.hidden = false;
				bottom();
				/* Only take the focus back when nothing else claimed it — the search
				   palette closes as soon as the focus leaves it */
				const now = document.activeElement;
				if (!now || now === document.body || win.el.contains(now)) input.focus({ preventScroll: true });
			}
		}
	}

	/* Ctrl+C while a command runs */
	function cancel() {
		if (!current) return;
		const ctl = current;
		ctl.abort();          // answers its open question (readLine listens to the signal)
		io.dim('^C');
	}

	/* ---------- Tab completion ---------- */

	function complete() {
		const v = input.value;
		const parts = v.split(' ');
		let pool = [];
		if (parts.length === 1) {
			pool = commands.names();
		} else {
			const entry = commands.get(fold(parts[0]));
			try {
				const list = entry?.def.complete?.(parts.at(-1), { name: entry.name, rest: '', line: v, shell });
				if (Array.isArray(list)) pool = list.filter(x => typeof x === 'string').slice(0, 2000);
			} catch (e) {
				console.warn(`[terminal] completion of '${entry?.name}' failed:`, e);
			}
		}
		const r = completeLine(v, pool);
		if (!r) return;
		if (r.value != null) {
			input.value = r.value;
			return;
		}
		echo(v);
		io.dim(r.list.slice(0, 60).join('  '));
	}

	/* ---------- Keys ---------- */

	input.addEventListener('keydown', e => {
		if (busy || e.isComposing) return;
		if (e.key === 'Enter') {
			e.preventDefault();
			const v = input.value;
			input.value = '';
			draft = '';
			run(v);
		} else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
			e.preventDefault();
			if (histPos === state.history.length) draft = input.value;
			histPos = Math.min(state.history.length, Math.max(0, histPos + (e.key === 'ArrowUp' ? -1 : 1)));
			input.value = state.history[histPos] ?? draft;
			const end = input.value.length;
			requestAnimationFrame(() => input.setSelectionRange(end, end));
		} else if (e.key === 'Tab' && !e.shiftKey && input.value.trim()) {
			/* An empty line lets Tab leave the terminal, so the keyboard never gets stuck */
			e.preventDefault();
			complete();
		} else if (mod(e) && e.key.toLowerCase() === 'l') {
			e.preventDefault();
			clear();
		} else if (mod(e) && e.key.toLowerCase() === 'c' && !getSelection().toString()) {
			e.preventDefault();
			io.print([prompt(), input.value, h('span', { class: 'term-dim', text: '^C' })]);
			input.value = '';
			histPos = state.history.length;
		} else if (mod(e) && e.key.toLowerCase() === 'u') {
			e.preventDefault();
			input.value = '';
		}
	});

	/* While a command runs the focus rests on the output: Ctrl+C cancels it */
	scroller.addEventListener('keydown', e => {
		if (!busy || e.target !== scroller) return;
		if (mod(e) && e.key.toLowerCase() === 'c' && !getSelection().toString()) {
			e.preventDefault();
			cancel();
		}
	});

	/* A click anywhere puts the cursor into the prompt — unless text is being selected */
	scroller.addEventListener('click', e => {
		if (e.target.closest('a, input') || getSelection().toString()) return;
		const ask = scroller.querySelector('.term-ask input');
		if (ask) ask.focus({ preventScroll: true });
		else if (!line.hidden) input.focus({ preventScroll: true });
	});

	/* login / logout (vault) — also a kept login that resumes after this window was restored */
	const offVault = Desk.on('vault:change', refreshPrompt);
	/* A backup was restored or the history reset in the settings */
	const reload = ({ names, groups } = {}) => {
		if ((names && !names.includes(KEY)) || (groups && !groups.includes('terminal'))) return;
		state = load();
		histPos = state.history.length;
	};
	const offRestore = Desk.on('storage:restore', reload);
	const offReset = Desk.on('storage:reset', reload);

	labels();
	io.heading(t('welcome', { name: Desk.L(Desk.config.brand.name), version: Desk.version }));
	if (state.last) io.dim(t('lastLogin', { date: Desk.i18n.fmtDate(new Date(state.last), { dateStyle: 'medium', timeStyle: 'short' }) }));
	io.dim(t('welcomeHelp'));
	state = { ...state, last: Date.now() };
	save(state);

	win.state.term = {
		input, labels, clear, clearHistory,
		ask: () => scroller.querySelector('.term-ask input'),
		close() {
			closing = true;
			current?.abort();
			for (const finish of [...asks]) finish(null);
			save(state);
			offVault();
			offRestore();
			offReset();
		}
	};
}

/* ---------- Window hooks ---------- */

export default {
	mount,

	focus(win) {
		const s = win.state.term;
		(s?.ask() || s?.input)?.focus({ preventScroll: true });
	},

	relabel(win) {
		win.state.term?.labels();
	},

	menu(win) {
		return [
			{ label: t('clear'), run: () => win.state.term?.clear() },
			{ label: t('clearHistory'), run: () => win.state.term?.clearHistory() }
		];
	},

	unmount(win) {
		win.state.term?.close();
	}
};
