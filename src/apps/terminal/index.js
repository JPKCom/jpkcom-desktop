/* JPKCom Desktop — Terminal app: a small shell ("jsh") over the desktop, with a command plugin registry — © Jean Pierre Kolb — MIT License

   The window: an output log (role=log) and one prompt line. Commands come
   from one registry (registry.js):
     - built-ins in ./commands/ (core, fs, sys, browser, storage; net only
       with a DNS-over-HTTPS resolver; eggs unless config.terminal.eggs is false),
     - the 'terminal' contributions of other modules
       (descriptor: terminal: { login: { run(args, io), help, hidden, sensitive } } — the vault does),
     - runtime plugins through the service: Desk.terminal.register(name, def).

   This file is the descriptor: the registry, the contributions, the service,
   storage, consent and config. The window and the built-in commands are
   window.js and commands/*.js, loaded when the first terminal window opens
   (app field load, windowStyles); setup() reserves the built-ins' names, so
   they keep their place in `help` and win over a module or plugin of the
   same name as before. Until then Desk.terminal.list()/has() know the
   contributed and runtime commands only.

   The history lives in storage key 'term' ({ history, last }, validated,
   config.terminal.historySize lines). A command marked sensitive (vault's
   login) goes into it by name only, without its arguments, and its echo
   shows "name …".

   io — what a command gets to print and ask (also the contract for plugins):
     say(text | nodes[], cls?) → row     err(text)     dim(text)     heading(text)     blank()
     print(nodes[], cls?) → row          table(rows [[key, value]], { gap = 2, wrap = false })
     link(text, href, base?) → <a>       markdown(text, baseUrl)   progress(text) → done()
     readLine(label, { secret }) → Promise<string | null>   (null: Esc / Ctrl+C)
     clear()   cols() → characters per line   win   signal (AbortSignal: Ctrl+C, window closed)
   ctx (third argument of run): { name, rest, line, shell: { cwd, cd, user, host, history,
     clearHistory, commands, close, shake } }. */

import Desk from '../../core/api.js';
import { cleanState, cleanConfig, cleanDoh, HISTORY_DEFAULT } from './config.js';
import { createCommands } from './registry.js';

export const KEY = 'term';
export const DNS = 'dns';

/* The resolver as configured — known at import, for the consent declaration below */
const DOH = cleanDoh(Desk.config.terminal?.doh);

let cfg = cleanConfig(Desk.config.terminal);
/** The cleaned config section (setup() takes the module loader's copy) */
export const config = () => cfg;
export const historySize = () => cfg.historySize ?? HISTORY_DEFAULT;

/* ---------- Command registry ---------- */

export const commands = createCommands({ warn: msg => console.warn(msg) });

/* Every built-in name, in help order (window.js registers them; the DNS commands only when on) */
export const ORDER = ['help', 'ls', 'cd', 'pwd', 'open', 'man', 'cat', 'search', 'dig', 'host', 'nslookup', 'history', 'clear',
	'date', 'cal', 'whoami', 'uname', 'neofetch', 'browser', 'df', 'du', 'lang', 'theme', 'accent', 'credits', 'echo', 'exit'];
const NET = ['dig', 'host', 'nslookup'];

/** Are the DNS commands on? (a resolver configured and the service enabled) */
export const dnsOn = () => !!cfg.doh && Desk.consent.enabled(DNS);

/** The built-in names this configuration has */
export const builtinNames = () => ORDER.filter(n => dnsOn() || !NET.includes(n));

/* 'terminal' contributions: { module, id (= name), run, help, … } */
function addContributions(list) {
	for (const item of list) {
		if (item.module === 'terminal') continue;
		commands.register(item.id, item, { source: `module:${item.module}` });
	}
}

/* ---------- Stored history ---------- */

export const load = () => Desk.store.getJson(KEY, v => cleanState(v, historySize()), null) ?? { history: [], last: null };
export const save = state => Desk.store.setJson(KEY, state);

/* ---------- Descriptor ---------- */

export default {
	id: 'terminal',
	kind: 'app',
	i18n: ['terminal'],
	windowStyles: ['terminal.css'],

	app: {
		icon: 'ti-terminal-2', tint: 'black', size: [760, 480], name: '@terminal.appName', desc: '@terminal.appDesc',
		load: () => import('./window.js')
	},

	storage: {
		term: {
			type: 'json', backup: true, reset: 'terminal', label: '@terminal.historyLabel',
			validate: v => cleanState(v, historySize()), count: v => v.history.length
		}
	},
	resetGroups: [{ id: 'terminal', label: '@terminal.historyLabel', hint: '@terminal.resetHint', order: 58 }],

	/* DNS lookups go to a third party: an online service with the user's consent (only when configured) */
	consent: DOH ? [{ id: DNS, hosts: [DOH.host], label: '@terminal.dnsService', hint: '@terminal.dnsServiceHint' }] : [],

	configKey: 'terminal',
	validateConfig: (section, warn) => cleanConfig(section, warn),

	setup(desk) {
		cfg = desk.modules.config('terminal') ?? cleanConfig(desk.config.terminal);
		/* The built-ins come with the window; their names are taken now (order, precedence) */
		commands.reserve(builtinNames(), 'builtin');
		addContributions(desk.modules.contributions('terminal'));
		/* Modules set up later bring their commands along; a failed one takes them back */
		desk.on('module:loaded', ({ id }) => addContributions(desk.modules.contributions('terminal').filter(x => x.module === id)));
		desk.on('module:failed', ({ id }) => commands.removeSource(`module:${id}`));
		desk.provide('terminal', Object.freeze({
			/** Adds a command: register(name, { run(args, io, ctx), help, usage, man, complete, hidden, sensitive, when }) → remove() | null */
			register: (name, def) => commands.register(name, def, { source: 'runtime' }),
			/** The available commands: [{ name, hidden, source }] (the built-ins once a terminal window has opened) */
			list: () => commands.list({ hidden: true }).map(e => ({ name: e.name, hidden: e.def.hidden, source: e.source })),
			has: name => commands.has(name)
		}));
	}
};
