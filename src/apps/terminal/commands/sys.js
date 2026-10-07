/* JPKCom Desktop — terminal: system commands (date, cal, whoami, uname, neofetch, lang, theme, accent, credits) — © Jean Pierre Kolb — MIT License

   neofetch shows the brand's ASCII art (config.brand.asciiLogo, default: the
   JPK monogram), the desktop's facts and the author credit; cal draws the
   month with the public holidays of the holidays service (when one is
   loaded); lang/theme/accent change the preferences through the core i18n
   and the settings service.

   Brand asset, NOT MIT: the block-letter JPK monogram JPK_LOGO (the default
   of config.brand.asciiLogo) — © 1996–2026 Jean Pierre Kolb, all rights
   reserved; see CREDITS.md. The rest of this file is MIT. */

import Desk from '../../../core/api.js';
import { fold } from '../lib.js';
import { counts } from '../catalog.js';

const t = (key, params) => Desk.t(`terminal.${key}`, params);

/** The JPK monogram in block letters (default of config.brand.asciiLogo) — brand asset, not MIT (CREDITS.md) */
export const JPK_LOGO = Object.freeze([
	'     ██╗██████╗ ██╗  ██╗',
	'     ██║██╔══██╗██║ ██╔╝',
	'     ██║██████╔╝█████╔╝ ',
	'██   ██║██╔═══╝ ██╔═██╗ ',
	'╚█████╔╝██║     ██║  ██╗',
	' ╚════╝ ╚═╝     ╚═╝  ╚═╝'
]);

/** config.brand.asciiLogo: an array of up to 16 lines of up to 40 characters, else the default */
export function asciiLogo(v) {
	if (Array.isArray(v) && v.length > 0 && v.length <= 16 && v.every(l => typeof l === 'string' && l.length <= 40 && !/[\u0000-\u001f]/.test(l))) return v;
	return JPK_LOGO;
}

/**
 * The days of a month as calendar rows: arrays of 7 cells (day numbers or null), weeks
 * starting on firstDay (1 = Monday … 7 = Sunday). Pure.
 */
export function monthGrid(y, m, firstDay = 1) {
	const first = new Date(y, m, 1).getDay() || 7;          // 1 = Monday … 7 = Sunday
	const offset = (first - firstDay + 7) % 7;
	const count = new Date(y, m + 1, 0).getDate();
	const rows = [];
	let cells = Array(offset).fill(null);
	for (let d = 1; d <= count; d++) {
		cells.push(d);
		if (cells.length === 7 || d === count) {
			rows.push(cells);
			cells = [];
		}
	}
	return rows;
}

const uptime = () => t('uptime', { n: Math.round(performance.now() / 60000) });
const host = () => Desk.config.brand.host || (typeof location !== 'undefined' && location.hostname) || 'localhost';
const brand = () => Desk.L(Desk.config.brand.name);

/* Labels of the settings namespace when the panels are there, else the id */
const settingsLabel = (key, fallback) => (Desk.i18n.has(`settings.${key}`) ? Desk.t(`settings.${key}`) : fallback);

/* Week start: config.calendar.firstDay (1–7) or the language's own */
function firstDay() {
	const v = Desk.config.calendar?.firstDay;
	return Number.isInteger(v) && v >= 1 && v <= 7 ? v : Desk.i18n.weekInfo().firstDay;
}

function cal(args, io) {
	const now = new Date();
	const y = now.getFullYear();
	const m = now.getMonth();
	const fd = firstDay();
	const title = Desk.i18n.fmtDate(now, { month: 'long', year: 'numeric' });
	io.say(title.padStart(Math.floor((20 + title.length) / 2)), 'term-pre term-h');
	/* 2 Jan 2023 was a Monday: weekday i (1 = Monday) is 1 Jan 2023 + i */
	const days = Array.from({ length: 7 }, (_, i) => {
		const wd = ((fd - 1 + i) % 7) + 1;
		return [...Desk.i18n.fmtDate(new Date(2023, 0, 1 + wd), { weekday: 'short' })].slice(0, 2).join('').padEnd(2);
	});
	io.say(days.join(' '), 'term-pre');
	const hols = (Desk.holidays?.year?.(y) ?? []).filter(x => x.date instanceof Date && x.date.getMonth() === m);
	const holDays = new Set(hols.map(x => x.date.getDate()));
	for (const row of monthGrid(y, m, fd)) {
		io.print(row.flatMap((c, i) => {
			let cell = '  ';
			if (c != null) {
				const cls = [c === now.getDate() ? 'term-today' : '', holDays.has(c) ? 'term-holiday' : ''].filter(Boolean).join(' ');
				cell = cls ? Desk.h('span', { class: cls, text: String(c).padStart(2) }) : String(c).padStart(2);
			}
			return i ? [' ', cell] : [cell];
		}), 'term-pre');
	}
	if (!hols.length) return;
	io.blank();
	io.dim(Desk.holidays.heading?.() ?? t('holidays'));
	for (const x of hols) {
		const day = Desk.i18n.fmtDate(x.date, { day: 'numeric', month: 'short' });
		io.print([Desk.h('span', { class: 'term-holiday', text: day.padEnd(8) }), x.name], 'term-pre');
	}
}

function neofetch(args, io, { shell }) {
	const logo = asciiLogo(Desk.config.brand.asciiLogo);
	/* the art column has a fixed width: block glyphs may come from a fallback font with other advances */
	const width = Math.max(...logo.map(l => [...l].length)) + 3;
	const resolved = typeof document !== 'undefined' ? document.documentElement.dataset.theme : 'dark';
	const prefs = Desk.settings?.get?.();
	const accent = prefs?.accent ? settingsLabel(`accent.${prefs.accent}`, prefs.accent) : null;
	const mode = settingsLabel(`theme.${resolved === 'light' ? 'light' : 'dark'}`, resolved);
	const cs = counts();
	const info = [
		[Desk.h('span', { class: 'term-user', text: shell.user() }), '@', Desk.h('span', { class: 'term-user', text: host() })],
		['─'.repeat(22)],
		[t('nfOs'), `${brand()} ${Desk.version}`],
		[t('nfKernel'), t('kernel')],
		[t('nfShell'), `jsh ${Desk.version}`],
		[t('nfUptime'), uptime()],
		[t('nfResolution'), `${innerWidth} × ${innerHeight}`],
		[t('nfLanguage'), Desk.i18n.displayName(Desk.lang())],
		[cs[0].label, cs.map((c, i) => (i ? `${c.label} ${Desk.i18n.fmtNumber(c.count)}` : Desk.i18n.fmtNumber(c.count))).join(' · ')],
		[t('nfWindows'), t('windows', { n: Desk.windows().length })],
		[t('nfTheme'), accent ? t('themeValue', { accent, mode }) : mode]
	];
	if (Desk.config.credit !== false) info.push([t('nfCredit'), t('credit', { product: Desk.project.name, author: Desk.config.author?.name || Desk.project.author })]);
	const tints = Object.keys(Desk.config.theme.tints ?? {}).slice(0, 10);
	const rows = Math.max(logo.length, info.length + 1);
	for (let i = 0; i < rows; i++) {
		/* spaces give the column its width in the real font; the art lies on top of them */
		const art = Desk.h('span', { class: 'term-art-col', 'aria-hidden': 'true' },
			' '.repeat(width), Desk.h('span', { class: 'term-logo', text: logo[i] || '' }));
		const row = info[i];
		let rest = [];
		if (i === info.length) {
			rest = tints.map(c => Desk.h('span', { class: 'tile term-swatch', 'aria-hidden': 'true', style: { '--tint': Desk.icons.tintValue(c) } }));
		} else if (row && row.length === 2 && typeof row[0] === 'string' && typeof row[1] === 'string') {
			rest = [Desk.h('span', { class: 'term-key', text: `${row[0]}: ` }), row[1]];
		} else if (row) {
			rest = row;
		}
		io.print([art, ...rest], 'term-pre term-art');
	}
}

/* lang [code|name] — lists the languages or switches */
async function lang(args, io) {
	const codes = Desk.i18n.available();
	const q = fold(args.join(' '));
	if (!q) {
		for (const c of codes) io.say(`${c === Desk.lang() ? '*' : ' '} ${c.padEnd(6)} ${Desk.i18n.displayName(c)}`, 'term-pre');
		return;
	}
	const code = codes.find(c => fold(c) === q) ?? codes.find(c => fold(Desk.i18n.displayName(c)) === q || fold(Desk.i18n.displayName(c, Desk.lang())) === q);
	if (!code) {
		io.err(t('langUnknown', { value: args.join(' '), list: codes.join(' ') }));
		return;
	}
	if (code !== Desk.lang()) await Desk.i18n.setLang(code);
	io.say(t('langSet', { name: Desk.i18n.displayName(code) }));
}

const MODES = ['dark', 'light', 'auto'];

function theme(args, io) {
	const s = Desk.settings;
	const q = fold(args[0] ?? '');
	if (!q) {
		const p = s.get();
		io.say(t('themeNow', { mode: settingsLabel(`theme.${p.theme}`, p.theme) }));
		io.dim(t('choices', { list: MODES.join(' ') }));
		return;
	}
	const mode = MODES.find(m => m === q || fold(settingsLabel(`theme.${m}`, m)) === q);
	if (!mode || !s.set('theme', mode)) {
		io.err(t('badValue', { cmd: 'theme', value: args[0], list: MODES.join(' ') }));
		return;
	}
	io.say(t('themeNow', { mode: settingsLabel(`theme.${mode}`, mode) }));
}

function accent(args, io) {
	const s = Desk.settings;
	const ids = Object.keys(Desk.config.theme.accents ?? {});
	const q = fold(args[0] ?? '');
	if (!q) {
		const now = s.get().accent;
		for (const id of ids) io.say(`${id === now ? '*' : ' '} ${id.padEnd(10)} ${settingsLabel(`accent.${id}`, id)}`, 'term-pre');
		if (!ids.includes(now)) io.say(`* ${now}`, 'term-pre');
		return;
	}
	const id = ids.find(x => x === q || fold(settingsLabel(`accent.${x}`, x)) === q) ?? (/^#[0-9a-f]{6}$/.test(q) ? q : null);
	if (!id || !s.set('accent', id)) {
		io.err(t('badValue', { cmd: 'accent', value: args[0], list: ids.join(' ') }));
		return;
	}
	io.say(t('accentNow', { name: settingsLabel(`accent.${id}`, id) }));
}

function credits(args, io) {
	const author = Desk.config.author ?? {};
	io.heading(`${Desk.project.name} ${Desk.version}`);
	io.say(t('credit', { product: Desk.project.name, author: author.name || Desk.project.author }));
	if (author.url) io.print([`${t('creditAuthor')} `, io.link(author.url, author.url)]);
	io.print([`${t('creditSource')} `, io.link(Desk.project.repo, Desk.project.repo)]);
	io.dim(t('creditLicense', { license: Desk.project.license }));
	io.dim(t('creditIcons'));
}

export default {
	date: {
		help: '@terminal.cmd.date',
		run: (args, io) => io.say(Desk.i18n.fmtDate(new Date(), { dateStyle: 'full', timeStyle: 'medium' }))
	},
	cal: { help: '@terminal.cmd.cal', man: '@terminal.man.cal', run: cal },
	whoami: {
		help: '@terminal.cmd.whoami',
		run: (args, io, { shell }) => io.say(shell.user())
	},
	uname: {
		help: '@terminal.cmd.uname',
		usage: '@terminal.usage.uname',
		complete: () => ['-a'],
		run: (args, io) => io.say(args.includes('-a')
			? `${brand()} ${Desk.version} ${host()} jsh-${Desk.version} #1 ${(typeof navigator !== 'undefined' && navigator.platform) || 'Web'} JavaScript`
			: Desk.L(Desk.config.brand.menuLabel) || brand())
	},
	neofetch: { help: '@terminal.cmd.neofetch', run: neofetch },
	lang: {
		help: '@terminal.cmd.lang',
		usage: '@terminal.usage.lang',
		complete: () => Desk.i18n.available(),
		when: () => Desk.i18n.available().length > 1,
		run: lang
	},
	theme: {
		help: '@terminal.cmd.theme',
		usage: '@terminal.usage.theme',
		complete: () => MODES,
		when: () => typeof Desk.settings?.set === 'function',
		run: theme
	},
	accent: {
		help: '@terminal.cmd.accent',
		usage: '@terminal.usage.accent',
		complete: () => Object.keys(Desk.config.theme.accents ?? {}),
		when: () => typeof Desk.settings?.set === 'function',
		run: accent
	},
	credits: { help: '@terminal.cmd.credits', run: credits }
};
