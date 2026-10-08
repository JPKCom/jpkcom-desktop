/* JPKCom Desktop — tests: the input table of the site icon set path rule (shared by several tests) — © Jean Pierre Kolb — MIT License

   src/core/icon-sets.js SET_PATH, its copy in sw.js and the rule generated into src/boot/preload.js
   must all accept GOOD_PATHS and refuse BAD_PATHS (docs/ARCHITECTURE.md §6 iconSets). */

export const GOOD_PATHS = ['site/icon-sets/x.json', 'x.json', 'icon-sets/a_b-c.1.json', `site/${'a'.repeat(246)}.json`];
export const BAD_PATHS = ['../x.json', 'site/../x.json', 'site/%2e%2e/x.json', '/abs/x.json', '//h/x.json', 'https://h/x.json',
	'site//x.json', 'site/.hidden.json', 'site/./x.json', './x.json', 'site/x.JSON', 'site\\x.json', 'site/x.json?v=1',
	'site/x.json#a', 'site/x y.json', 'site/x\u0000.json', 'site/x\n.json', 'site/x\t.json', `site/${'a'.repeat(247)}.json`,
	'site/x.js', 'site/icon-sets/', '', 7, null, undefined, ['x.json'], { src: 'x.json' }];
