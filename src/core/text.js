/* JPKCom Desktop — text helpers shared by Search, Catalog and the terminal — © Jean Pierre Kolb — MIT License

   One folding rule for every place that matches what the user types against
   names and texts, so the same query finds the same things everywhere.

   No imports, no DOM — safe in Node (tests) and for any part to import. */

/**
 * Folds text for matching: lower case with the language's rules (Turkish 'İ' → 'i'),
 * no diacritics ('Ärger' → 'arger'), 'ß' → 'ss' ('Straße' → 'strasse').
 * locale: a BCP 47 tag or nothing (then the engine's default lower-casing).
 */
export function fold(text, locale) {
	let s = String(text ?? '');
	try {
		s = locale ? s.toLocaleLowerCase(locale) : s.toLowerCase();
	} catch {
		s = s.toLowerCase();
	}
	return s.normalize('NFD').replace(/\p{M}/gu, '').replace(/ß/g, 'ss');
}
