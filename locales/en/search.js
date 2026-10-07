/* JPKCom Desktop — search strings: English (reference locale) — © Jean Pierre Kolb — MIT License

   Namespace 'search' (src/modules/search). {keys}: a shortcut as the user reads it
   ('Ctrl+K', '⌘K'); {list}: group or provider names joined by i18n.list(); {hits}: the
   'hits' text. Group names can be anything (a site's own label), so the sentences let
   {list} stand on its own instead of building it into the grammar. */
export default {
	title: 'Search',
	placeholder: 'Search',
	button: 'Search ({keys})',
	open: 'Open search',
	groupApps: 'Apps',
	fullText: 'Full-text search',
	scope: '{list}',
	hits: { one: '{n} result', other: '{n} results' },
	loading: 'Searching … ({list})',
	off: '{hits} · {list}: currently unavailable',
	newTab: '(opens in new tab)',
	keySelect: 'select',
	keyOpen: 'open',
	keyClose: 'close'
};
