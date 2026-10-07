/* JPKCom Desktop — type checks shared by the pure parts (validators, parsers, models) — © Jean Pierre Kolb — MIT License

   One definition instead of a copy per file. store.js builds V.isObj from it;
   the pure files of the shell, the apps and the modules import it directly.

   No imports, no DOM — safe in Node (tests) and for any part to import. */

/** Plain object: not null, not an array. */
export const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
