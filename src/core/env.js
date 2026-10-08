/* JPKCom Desktop — environment: version, paths, compact mode, motion — © Jean Pierre Kolb — MIT License

   The single switch for phone layouts lives here: body.compact is set from
   config.ui.compactQuery, and CSS reads ONLY that class (never its own media
   query for the same purpose). Safe to import in Node (tests): every browser
   access is guarded. */

/** Project version (semantic versioning). Shown in About, the terminal and backups. */
export const VERSION = '1.1.0';

/** Project name and author — the attribution that stays in every fork. */
export const PROJECT = Object.freeze({
	name: 'JPKCom Desktop',
	author: 'Jean Pierre Kolb',
	url: 'https://www.jpkc.com/',
	repo: 'https://github.com/JPKCom/jpkcom-desktop',
	license: 'MIT'
});

export const SVGNS = 'http://www.w3.org/2000/svg';

/** The installation root (the folder of index.html) as an absolute URL with a trailing slash. */
export const ROOT = new URL('../../', import.meta.url).href;

/** Resolves a path relative to the installation root ('locales/de/core.js' → absolute URL). */
export const asset = path => new URL(path, ROOT).href;

const hasWindow = typeof window !== 'undefined' && typeof document !== 'undefined';
const mq = query => (hasWindow && typeof matchMedia === 'function' ? matchMedia(query) : null);

export const isSecure = hasWindow ? window.isSecureContext === true : false;

const reduceMQ = mq('(prefers-reduced-motion: reduce)');
let compactMQ = null;

/** True when the user asked for less motion. Read it at the moment of use — it can change live. */
export const reduceMotion = () => reduceMQ?.matches === true;

/** True in compact (phone) mode. */
export const isCompact = () => compactMQ?.matches === true;

/** True when running as an installed app (own window, no browser bar). */
export const isStandalone = () => mq('(display-mode: standalone)')?.matches === true || (hasWindow && navigator.standalone === true);

/** True on keyboards with a ⌘ key (Apple platforms): Mod is that key, shortcut hints use symbols. */
export const hasCmdKey = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');

/** Runs fn after ms — immediately when reduced motion is on (animations are skipped then). */
export const later = (fn, ms) => (reduceMotion() ? fn() : setTimeout(fn, ms));

export const clamp = (v, min, max) => Math.min(Math.max(v, min), Math.max(min, max));

/**
 * Wires body.compact / body.standalone and reports changes through emit(name, payload).
 * Called once by boot/main.js before anything renders.
 */
export function initEnv({ compactQuery, emit }) {
	if (!hasWindow) return;
	compactMQ = mq(compactQuery);
	const body = document.body;
	const syncCompact = () => body.classList.toggle('compact', isCompact());
	syncCompact();
	compactMQ?.addEventListener('change', () => {
		syncCompact();
		emit('env:compact', { compact: isCompact() });
	});

	const standaloneMQ = mq('(display-mode: standalone)');
	const syncStandalone = () => body.classList.toggle('standalone', isStandalone());
	syncStandalone();
	standaloneMQ?.addEventListener('change', syncStandalone);

	reduceMQ?.addEventListener('change', () => emit('env:motion', { reduce: reduceMotion() }));

	/* The desktop itself never scrolls; focus() or anchors inside windows must not shift it */
	addEventListener('scroll', () => { if (scrollX || scrollY) scrollTo(0, 0); });
}
