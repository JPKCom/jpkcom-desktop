/* JPKCom Desktop — terminal: storage use (df, du) — © Jean Pierre Kolb — MIT License

   df: local storage, session storage and the origin's quota in df -h's
   layout, split into this desktop's keys (config.namespace prefix) and other
   keys of the same origin. du: every local storage key by size. Sizes are
   characters of key + value (1K = 1024 characters) — what the browsers limit. */

import Desk from '../../../core/api.js';
import { fold, human as humanRaw } from '../lib.js';

const t = (key, params) => Desk.t(`terminal.${key}`, params);

/** What the browsers limit local/session storage to: characters of keys and values per origin */
export const AREA_QUOTA = 5 * 1024 * 1024;

const human = n => humanRaw(n, (v, d) => Desk.i18n.fmtNumber(v, { minimumFractionDigits: d, maximumFractionDigits: d }));
const total = list => list.reduce((n, x) => n + x.size, 0);

/** Keys of local or session storage with their size in characters; null when blocked */
export function areaUse(area) {
	try {
		const list = [];
		for (let i = 0; i < area.length; i++) {
			const key = area.key(i);
			list.push({ key, size: key.length + (area.getItem(key) || '').length });
		}
		return list;
	} catch {
		return null;
	}
}

const local = () => {
	try {
		return areaUse(globalThis.localStorage);
	} catch {
		return null;
	}
};
const session = () => {
	try {
		return areaUse(globalThis.sessionStorage);
	} catch {
		return null;
	}
};

/** One df row: [fs, size, used, avail, use%, mount] */
export function dfRow(fs, size, used, mount, fmt = human) {
	return [fs, fmt(size), fmt(used), fmt(Math.max(0, size - used)), `${Math.min(100, Math.ceil((used / size) * 100))}%`, mount];
}

/** Lines of a df table: first and last column left-aligned, the others right-aligned */
export function dfLines(head, rows) {
	const w = head.map((x, i) => Math.max(x.length, ...rows.map(r => r[i].length)));
	const line = r => r.map((x, i) => (i === 0 || i === 5 ? x.padEnd(w[i]) : x.padStart(w[i]))).join('  ').trimEnd();
	return [line(head), ...rows.map(line)];
}

const USAGE_NAMES = { caches: 'Cache Storage', indexedDB: 'IndexedDB', serviceWorkerRegistrations: 'Service Worker', fileSystem: 'File System' };

async function df(args, io) {
	const loc = local();
	const ses = session();
	const within = (fn, ms) => Promise.race([Promise.resolve().then(fn).catch(() => null), new Promise(done => setTimeout(done, ms, null))]);
	const [est, persisted] = await Promise.all([
		within(() => navigator.storage.estimate(), 1500),
		within(() => navigator.storage.persisted(), 1000)
	]);
	const mount = `/${location.host || 'localhost'}`;
	const rows = [];
	if (loc) rows.push(dfRow('localStorage', AREA_QUOTA, total(loc), mount));
	if (ses) rows.push(dfRow('sessionStorage', AREA_QUOTA, total(ses), t('dfTab', { mount })));
	if (est?.quota > 0) rows.push(dfRow('origin', est.quota, est.usage || 0, `${mount} (IndexedDB, Cache)`));
	if (!rows.length) {
		io.err(t('dfNone', { cmd: 'df' }));
		return;
	}
	const head = ['dfFs', 'dfSize', 'dfUsed', 'dfAvail', 'dfUse', 'dfMount'].map(k => t(k));
	const [first, ...lines] = dfLines(head, rows);
	io.say(first, 'term-pre term-h');
	for (const l of lines) io.say(l, 'term-pre');
	io.blank();
	if (loc) {
		const prefix = Desk.store.key('');
		const own = loc.filter(x => x.key.startsWith(prefix));
		const other = loc.filter(x => !x.key.startsWith(prefix));
		const params = {
			size: human(total(own)), keys: t('dfKeys', { n: own.length }),
			otherSize: human(total(other)), otherKeys: t('dfKeys', { n: other.length })
		};
		io.dim(t(other.length ? 'dfOwnOther' : 'dfOwn', params));
	}
	const parts = Object.entries(est?.usageDetails || {}).filter(([, n]) => n > 0)
		.map(([k, n]) => `${USAGE_NAMES[k] || k} ${human(n)}`);
	if (parts.length) io.dim(t('dfDetails', { list: parts.join(' · ') }));
	if (persisted != null) io.dim(t(persisted ? 'dfPersistYes' : 'dfPersistNo'));
	io.dim(t('dfNote'));
}

/* du [word …] — every local storage key, biggest first; -s only the total */
function du(args, io) {
	const list = local();
	if (!list) {
		io.err(t('dfNone', { cmd: 'du' }));
		return;
	}
	const words = args.filter(a => !a.startsWith('-')).map(fold);
	const hits = list.filter(x => !words.length || words.some(q => fold(x.key).includes(q)))
		.sort((a, b) => b.size - a.size || a.key.localeCompare(b.key));
	if (!hits.length) {
		io.dim(t('duNone'));
		return;
	}
	const sum = human(total(hits));
	const shown = args.includes('-s') ? [] : hits.slice(0, 200);
	const w = Math.max(sum.length, ...shown.map(x => human(x.size).length));
	for (const x of shown) io.say(`${human(x.size).padStart(w)}  ${x.key.slice(0, 120)}`, 'term-pre');
	io.say(`${sum.padStart(w)}  ${t('duTotal')}`, 'term-pre term-h');
	io.dim(t('duNote'));
}

export default {
	df: { help: '@terminal.cmd.df', man: '@terminal.man.df', complete: () => ['-h'], run: df },
	du: {
		help: '@terminal.cmd.du',
		usage: '@terminal.usage.du',
		man: '@terminal.man.du',
		complete: () => ['-s', ...(local() || []).map(x => x.key)],
		run: du
	}
};
