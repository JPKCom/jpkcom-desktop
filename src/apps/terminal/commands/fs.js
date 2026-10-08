/* JPKCom Desktop — terminal: the catalogue as directories (ls, cd, pwd, open, cat, man) — © Jean Pierre Kolb — MIT License

   Directories are ~/apps and one per collection (catalog.js). `open` reaches
   every app and collection item (exact key or name, then a unique prefix,
   then a unique part of the name — the current directory first) and
   addresses on this site or https. `cat` prints the files of site/apps.js
   `files` (Markdown rendered, other text as it is). `man` explains a command
   (i18n) or prints the manual of an entry: a collection item's own `man`,
   else its collection's `man`, else config.terminal.manUrl (site/apps.js,
   ARCHITECTURE §7 "Manual pages"), and an item's `docs` text file; `~/apps`
   entries only their `docs`. An entry without a manual, or whose files are
   all missing, gets a calm note with a link — not an error. */

import Desk from '../../../core/api.js';
import { textOf } from '../registry.js';
import { fold, resolve, MAX_FETCH, isTextPath, manPlan, hasManual, manLookup, manMiss, manOutcome, isHtmlType } from '../lib.js';
import { dirNames, isDir, listing, targets, files } from '../catalog.js';

const t = (key, params) => Desk.t(`terminal.${key}`, params);
const URLISH = /^(https:\/\/|\/(?!\/)|\.\.?\/)/i;

/* 'apps/' '~/apps' '~' '..' → a directory name, '' (home) or null (unknown) */
function dirArg(raw, cwd) {
	let a = fold(raw).replace(/^~\/?/, '').replace(/\/+$/, '');
	if (a === '' || a === '..') return '';
	if (a === '.') return cwd;
	if (a.startsWith('../')) a = a.slice(3);
	else if (a.startsWith('./')) a = cwd ? null : a.slice(2);
	return a && isDir(a) ? a : null;
}

/** Same-origin text (Markdown, plain text) — null with an error row when it fails */
export async function loadText(io, path, label, { quiet = false } = {}) {
	const url = Desk.router.resolveUrl(path);
	if (!url || Desk.router.isExternal(url)) {
		if (!quiet) io.err(t('fetchError', { name: label }));
		return null;
	}
	const done = io.progress(t('loading', { name: label }));
	try {
		const text = await Desk.net.getText(url.href, { accept: 'text/markdown, text/plain', signal: io.signal });
		return { text: text.slice(0, MAX_FETCH), url: url.href };
	} catch (e) {
		if (e?.code !== 'aborted' && !quiet) io.err(t('fetchError', { name: label }));
		return null;
	} finally {
		done();
	}
}

/** Prints a text: Markdown for .md (and text/markdown), else line by line */
function printText(io, { text, url }) {
	if (/\.(md|markdown)$/i.test(new URL(url).pathname)) io.markdown(text, url);
	else for (const l of text.replace(/\n$/, '').split('\n')) io.say(l, 'term-pre');
}

/** Rows of a match list */
const matchRows = list => list.slice(0, 12).map(x => [`  ${x.key}`, x.name]);

function listDir(io, name) {
	const blocks = listing(name);
	if (!blocks.length) {
		io.dim(t('emptyDir', { dir: `${name}/` }));
		return;
	}
	for (const g of blocks) {
		io.heading(`${g.label}/`);
		io.table(g.items.map(x => [`  ${x.key}`, x.name]));
	}
}

/* open/man: 'dir/name' restricts the search to one directory; the current directory comes first
   → { query, list } (the query without the directory) */
function lookupList(q, cwd) {
	const m = q.match(/^~?\/?([a-z0-9-]+)\/(.+)$/i);
	const only = m && isDir(fold(m[1])) ? fold(m[1]) : null;
	return { query: only ? m[2] : q, list: targets({ only, first: cwd || null }) };
}

/* ---------- man ---------- */

/** A text file on this site (.md/.markdown/.txt) — only those are read */
const isTextFile = p => {
	const url = Desk.router.resolveUrl(p);
	return !!url && !Desk.router.isExternal(url) && isTextPath(url.pathname);
};

/** What `man` reads for an entry (lib.js manPlan); a page link that does not resolve counts as none */
function planOf(x, cfg) {
	const plan = manPlan({
		entry: x,
		collection: x.kind === 'apps' ? null : Desk.apps.collection(x.kind),
		manUrl: cfg.manUrl,
		chain: Desk.i18n.chain(),
		L: v => Desk.L(v),
		isText: isTextFile
	});
	return plan.page && !Desk.router.resolveUrl(plan.page) ? { ...plan, page: null } : plan;
}

/**
 * One manual file → { text, url } | { miss: 'external'|'missing'|'failed'|'stop'|'aborted' }.
 * Same origin only; an HTML answer (a fallback page sent with 200) counts as missing.
 */
async function fetchManual(path, signal) {
	const url = Desk.router.resolveUrl(path);
	if (!url || Desk.router.isExternal(url)) return { miss: 'external', url: path };
	let html = false;
	try {
		const text = await Desk.net.request(url.href, {
			read: 'text', accept: 'text/markdown, text/plain', signal,
			onHeaders: h => { html = isHtmlType(h.get('Content-Type')); }
		});
		/* a long manual is cut short and printed, as `cat` does (1.1.0) */
		return html ? { miss: 'missing', url: url.href } : { text: text.slice(0, MAX_FETCH), url: url.href };
	} catch (e) {
		return { miss: manMiss(e), url: url.href };
	}
}

function manCommand(io, entry) {
	const head = `${entry.name.toUpperCase()}(1)`;
	io.say(`${head}   ${t('manShell')}   ${head}`, 'term-pre term-dim');
	io.blank();
	io.heading(t('manName'));
	io.say(`${entry.name} — ${textOf(entry.def.help, Desk.L)}`.replace(/ — $/, ''), 'term-indent');
	io.blank();
	io.heading(t('manSynopsis'));
	io.say(textOf(entry.def.usage, Desk.L) || entry.name, 'term-indent');
	const text = textOf(entry.def.man, Desk.L) || '';
	if (text) {
		io.blank();
		io.heading(t('manDescription'));
		for (const p of text.split('\n')) io.say(p, 'term-indent');
	}
}

/** "<name> has no manual page." and where to go instead: the documentation page, else the entry itself */
function noManualPage(io, x, page) {
	io.dim(t('noManualPage', { name: x.name }));
	if (page) io.print([`${t('manMore')} `, io.link(page, page)], 'term-dim');
	else io.print([`${t('manOpen')} `, entryLink(io, x)], 'term-dim');
}

async function manEntry(io, x, plan) {
	const { texts, page, off } = plan;
	const tried = [];
	let loaded = null;
	let missing = 0;
	let failed = 0;
	let aborted = false;
	/* the next file (the next language of the chain) only while the files are missing or fail on the
	   server; offline or a timeout stops — the next request would fail the same way */
	for (const path of texts) {
		const done = io.progress(t('loading', { name: x.key }));
		const r = await fetchManual(path, io.signal);
		done();
		tried.push(r.url);
		if (r.text !== undefined) {
			loaded = r;
			break;
		}
		if (r.miss === 'aborted' || io.signal?.aborted) {
			aborted = true;
			break;
		}
		if (r.miss === 'missing') missing++;
		else failed++;
		if (r.miss === 'stop') break;
	}
	const outcome = manOutcome({ texts, page, off, loaded: !!loaded, missing, failed, aborted });
	if ((outcome === 'none' || outcome === 'error') && Desk.config.debug) console.info(`[terminal] man ${x.key}: ${outcome} — tried`, tried);
	switch (outcome) {
		case 'print': {
			const head = `${x.key.toUpperCase()}(1)`;
			io.say(`${head}   ${t('manHead', { name: Desk.L(Desk.config.brand.name) })}   ${head}`, 'term-pre term-dim');
			io.blank();
			printText(io, loaded);
			/* the full documentation as a page; without one the entry's own page (as the original did) */
			io.blank();
			io.print([`${t('manMore')} `, page ? io.link(page, page) : entryLink(io, x)], 'term-dim');
			break;
		}
		case 'link':
			io.print([`${t('manMore')} `, io.link(page, page)], 'term-dim');
			break;
		case 'error':
			io.err(t('fetchError', { name: x.key }));
			if (page) io.print([`${t('manMore')} `, io.link(page, page)], 'term-dim');
			break;
		case 'none':
			noManualPage(io, x, page);
			break;
		default:
	}
}

/* A link to the entry itself: its url (https or this site) or, without one, a button that launches it */
function entryLink(io, x) {
	const href = Desk.L(x.app.url);
	const url = href ? Desk.router.resolveUrl(href) : null;
	if (url && (url.protocol === 'https:' || (url.protocol === 'http:' && !Desk.router.isExternal(url)))) {
		const text = Desk.router.isExternal(url) ? url.href : (Desk.router.relPath(url) || url.href);
		return io.link(text, url.href);
	}
	return Desk.h('button', { type: 'button', class: 'term-link', text: x.name, onclick: () => Desk.launch(x.id) });
}

export default function fsCommands(cfg) {
	return {
		ls: {
			help: '@terminal.cmd.ls',
			usage: '@terminal.usage.ls',
			man: '@terminal.man.ls',
			complete: () => dirNames().map(d => `${d}/`),
			run(args, io, { shell }) {
				const words = args.filter(a => !a.startsWith('-'));
				if (!words.length) {
					if (shell.cwd()) listDir(io, shell.cwd());
					else io.say(t('dirs', { dirs: dirNames().map(d => `${d}/`).join('  ') }));
					return;
				}
				for (const w of words) {
					const d = dirArg(w, shell.cwd());
					if (d === '') io.say(t('dirs', { dirs: dirNames().map(x => `${x}/`).join('  ') }));
					else if (d) listDir(io, d);
					else io.err(t('unknownDir', { cmd: 'ls', dir: w }));
				}
			}
		},

		cd: {
			help: '@terminal.cmd.cd',
			usage: '@terminal.usage.cd',
			man: '@terminal.man.cd',
			complete: () => [...dirNames().map(d => `${d}/`), '..', '~'],
			run(args, io, { shell }) {
				const w = args.find(a => !a.startsWith('-')) ?? '~';
				if (w === '/' || w.startsWith('/') || (w === '..' && !shell.cwd())) {
					io.say(t('cdRoot'));
					return;
				}
				const d = dirArg(w, shell.cwd());
				if (d === null) io.err(t('unknownDir', { cmd: 'cd', dir: w }));
				else shell.cd(d);
			}
		},

		pwd: {
			help: '@terminal.cmd.pwd',
			run(args, io, { shell }) {
				io.say(`/home/${shell.user()}${shell.cwd() ? `/${shell.cwd()}` : ''}`);
			}
		},

		open: {
			help: '@terminal.cmd.open',
			usage: '@terminal.usage.open',
			man: '@terminal.man.open',
			complete: (word, { shell }) => [...targets({ first: shell.cwd() || null }).map(x => x.key), ...dirNames().map(d => `${d}/`)],
			run(args, io, { shell, rest }) {
				const q = rest.trim();
				if (!q) {
					io.err(t('usage', { usage: Desk.L('@terminal.usage.open') }));
					return;
				}
				if (URLISH.test(q) && Desk.openUrl(q)) {
					io.say(t('opening', { name: q }));
					return;
				}
				const { query, list } = lookupList(q, shell.cwd());
				const r = resolve(query, list);
				if (r.hit) {
					io.say(t('opening', { name: r.hit.name }));
					if (!Desk.launch(r.hit.id)) io.err(t('cannotOpen', { name: r.hit.name }));
				} else if (r.many) {
					io.say(t('ambiguous'));
					io.table(matchRows(r.many));
				} else {
					io.err(t('noSuch', { cmd: 'open', name: q }));
				}
			}
		},

		cat: {
			help: '@terminal.cmd.cat',
			usage: '@terminal.usage.cat',
			man: '@terminal.man.cat',
			complete: () => files().map(f => f.name),
			async run(args, io, { rest }) {
				const list = files();
				const names = () => {
					if (list.length) io.dim(t('files', { files: list.map(f => f.name).join('  ') }));
					else io.dim(t('noFiles'));
				};
				const raw = fold(rest.trim());
				if (!raw) {
					io.say(t('catUsage', { example: list[0]?.name ?? 'readme' }));
					names();
					return;
				}
				const bare = raw.replace(/\.(md|markdown|txt)$/, '');
				const file = list.find(f => fold(f.name) === raw || fold(f.name).replace(/\.(md|markdown|txt)$/, '') === bare
					|| f.aliases.includes(raw) || f.aliases.includes(bare));
				if (!file) {
					io.err(t('noSuch', { cmd: 'cat', name: rest.trim() }));
					names();
					return;
				}
				const loaded = await loadText(io, Desk.L(file.url), file.name);
				if (loaded) printText(io, loaded);
			}
		},

		man: {
			help: '@terminal.cmd.man',
			usage: '@terminal.usage.man',
			man: '@terminal.man.man',
			complete: (word, { shell }) => [...shell.commands.names(), ...targets().filter(x => hasManual(planOf(x, cfg))).map(x => x.key)],
			async run(args, io, { shell, rest }) {
				const q = rest.trim();
				if (!q) {
					io.say(t('whichManual'));
					return;
				}
				const entry = shell.commands.get(fold(q));
				/* a hidden command only by its exact name and only when it is documented (eggs are not) */
				const documented = d => !!(d.help || d.usage || d.man);
				if (entry && (!entry.def.hidden || (fold(q) === entry.name && documented(entry.def)))) {
					manCommand(io, entry);
					return;
				}
				/* an exact name always means that entry, also one without a manual (p09 "Manual pages of entries") */
				const { query, list } = lookupList(q, shell.cwd());
				const plans = new Map();
				const plan = x => {
					if (!plans.has(x)) plans.set(x, planOf(x, cfg));
					return plans.get(x);
				};
				/* a hidden command that has no page (an egg): only an entry of exactly that name answers */
				const r = manLookup(query, list, x => hasManual(plan(x)), { exact: !!entry });
				if (!r.hit) {
					io.err(t('noManual', { name: q }));
					if (r.many) io.table(matchRows(r.many));
					return;
				}
				if (!r.manual) {
					if (Desk.config.debug) console.info(`[terminal] man ${r.hit.key}: none — tried`, []);
					noManualPage(io, r.hit, plan(r.hit).page);
					return;
				}
				await manEntry(io, r.hit, plan(r.hit));
			}
		}
	};
}

export { dirArg };
