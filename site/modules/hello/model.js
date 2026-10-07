/* JPKCom Desktop — example site app "Hello": its stored data (pure, tested in Node) — © Jean Pierre Kolb — MIT License

   Everything read back from storage is untrusted (another tab, an old version, a hand-edited backup):
   clean() turns it into a clean { name, opens } or null, and the desktop then uses the fallback. */

export const MAX_NAME = 60;
export const EMPTY = Object.freeze({ name: '', opens: 0 });

/** At most MAX_NAME characters — counted as characters, so an emoji is never cut in half */
export const clip = text => [...String(text).trim()].slice(0, MAX_NAME).join('');

/** The stored value { name, opens } → a clean copy, or null when it is not an object */
export function clean(v) {
	if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
	return {
		name: typeof v.name === 'string' ? clip(v.name) : '',
		opens: Number.isSafeInteger(v.opens) && v.opens >= 0 ? v.opens : 0
	};
}
