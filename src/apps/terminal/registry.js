/* JPKCom Desktop — terminal: the command registry (built-ins, module contributions, runtime plugins) — © Jean Pierre Kolb — MIT License

   One table for every command the shell knows:
     - the built-in commands of this app (commands/*.js),
     - 'terminal' contributions of other modules (descriptor field, e.g. vault: login, logout),
     - commands added at runtime through the service: Desk.terminal.register(name, def).

   A command definition:
     { run(args, io, ctx),          // required; may be async. args: the words after the name
       help: text,                  // one line for `help` ('@ns.key', { lang: text }, a string or () → string)
       usage: text,                 // synopsis for `man` (default: the name)
       man: text,                   // longer description for `man` (default: help)
       complete(word, ctx) → [],    // Tab completion of arguments
       hidden: false,               // not in help, not completed, not suggested
       sensitive: false,            // arguments may hold secrets: the history keeps only the
                                    // name, the echo shows "name …" (login does this)
       when() → boolean }           // available right now? (a service is there, …)

   The first registration of a name wins; a later one is refused with a
   warning — unless the first was registered as weak (the easter eggs),
   which any later command replaces. A name can be reserved for a source
   before its definition is there (the built-ins, which load with the first
   window): the place in the order is taken at once, other sources are refused
   as if the command existed, and the command counts once that source
   registers it. Pure: no DOM, no desktop imports. */

import { NAME } from './config.js';

const isText = v => (typeof v === 'string' && v.length > 0) || (v !== null && typeof v === 'object' && !Array.isArray(v)
	&& Object.values(v).length > 0 && Object.values(v).every(x => typeof x === 'string'));

const isTextish = v => isText(v) || typeof v === 'function';

/** The text of a help/usage/man field: L resolves '@ns.key' and { lang: text }; functions are called */
export function textOf(v, L = x => (typeof x === 'string' ? x : '')) {
	if (typeof v === 'function') {
		try {
			const r = v();
			return typeof r === 'string' ? r : '';
		} catch {
			return '';
		}
	}
	return v == null ? '' : L(v);
}

/** A clean definition or null (with the reason passed to warn) */
export function cleanDef(def, warn = () => {}, name = '?') {
	if (typeof def === 'function') def = { run: def };
	if (!def || typeof def !== 'object' || typeof def.run !== 'function') {
		warn(`command '${name}' needs a run(args, io) function — skipped`);
		return null;
	}
	return Object.freeze({
		run: def.run,
		help: isTextish(def.help) ? def.help : null,
		usage: isTextish(def.usage) ? def.usage : null,
		man: isTextish(def.man) ? def.man : null,
		complete: typeof def.complete === 'function' ? def.complete : null,
		when: typeof def.when === 'function' ? def.when : null,
		hidden: def.hidden === true,
		sensitive: def.sensitive === true
	});
}

/**
 * Creates a command registry.
 *   warn(msg)   reports refused definitions
 *   onChange()  after every change
 */
export function createCommands({ warn = console.warn, onChange = () => {} } = {}) {
	const map = new Map();   // name → { name, def (null while only reserved), source, weak, seq }
	let seq = 0;

	const ready = e => {
		if (!e?.def) return false;
		if (!e.def.when) return true;
		try {
			return e.def.when() === true;
		} catch {
			return false;
		}
	};

	/**
	 * Adds a command. opts: { source: 'builtin' | 'module:<id>' | 'runtime', weak }.
	 * → remove() or null when refused.
	 */
	function register(name, def, { source = 'runtime', weak = false } = {}) {
		const n = typeof name === 'string' ? name.toLowerCase() : '';
		if (!NAME.test(n)) {
			warn(`[terminal] invalid command name ${JSON.stringify(name)} — use [a-z0-9-], starting with a letter`);
			return null;
		}
		const clean = cleanDef(def, msg => warn(`[terminal] ${msg}`), n);
		if (!clean) return null;
		const old = map.get(n);
		/* a weak command (an egg) steps aside silently when the name is taken */
		if (old && weak === true) return null;
		/* a reservation is filled by its own source only */
		if (old && !old.weak && (old.def || old.source !== source)) {
			warn(`[terminal] command '${n}' exists already (${old.source}) — the one from ${source} is ignored`);
			return null;
		}
		const entry = Object.freeze({ name: n, def: clean, source, weak: weak === true, seq: old ? old.seq : seq++ });
		map.set(n, entry);
		onChange();
		return () => {
			if (map.get(n) !== entry) return false;
			map.delete(n);
			onChange();
			return true;
		};
	}

	/** Reserves names for a source whose definitions come later (taken or invalid names are skipped) */
	function reserve(names, source = 'builtin') {
		for (const name of Array.isArray(names) ? names : []) {
			const n = typeof name === 'string' ? name.toLowerCase() : '';
			if (NAME.test(n) && !map.has(n)) map.set(n, Object.freeze({ name: n, def: null, source, weak: false, seq: seq++ }));
		}
	}

	/** Removes every command of a source (a module whose setup failed) */
	function removeSource(source) {
		let any = false;
		for (const [n, e] of map) {
			if (e.source === source) {
				map.delete(n);
				any = true;
			}
		}
		if (any) onChange();
		return any;
	}

	/** The command, when it exists and is available now */
	const get = name => {
		const e = map.get(String(name ?? '').toLowerCase());
		return e && ready(e) ? e : null;
	};

	/** Available commands in registration order; hidden ones only with { hidden: true } */
	const list = ({ hidden = false } = {}) => [...map.values()]
		.filter(e => ready(e) && (hidden || !e.def.hidden))
		.sort((a, b) => a.seq - b.seq);

	return Object.freeze({
		register, reserve, removeSource, get, list,
		has: name => get(name) !== null,
		names: opts => list(opts).map(e => e.name)
	});
}
