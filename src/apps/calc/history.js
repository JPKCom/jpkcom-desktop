/* JPKCom Desktop — calculator history: the stored calculations, checked — © Jean Pierre Kolb — MIT License

   Pure (no DOM, no Desk) and small: the descriptor (index.js) validates the
   storage key 'calc' with it at boot, before the window code (window.js,
   engine.js) is loaded. engine.js re-exports it for the window and the tests. */

/** Calculations the history keeps */
export const HISTORY = 50;

/** The last n entries of a list; n = 0 keeps none (slice(-0) would keep all) */
export const keepLast = (list, n) => (n > 0 ? list.slice(-n) : []);

/** Stored history { history: [{ e: '2 + 3', r: 5 }] } → cleaned (at most max), or null */
export function cleanCalc(v, max = HISTORY) {
	if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
	const history = Array.isArray(v.history)
		? v.history.filter(x => x && typeof x.e === 'string' && x.e.length <= 200 && /^[-+*/0-9.e ]+$/.test(x.e)
			&& typeof x.r === 'number' && Number.isFinite(x.r)).map(x => ({ e: x.e, r: x.r }))
		: [];
	return { history: keepLast(history, max) };
}
