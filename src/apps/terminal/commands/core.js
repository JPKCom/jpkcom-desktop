/* JPKCom Desktop — terminal: shell commands (help, history, clear, echo, search, exit) — © Jean Pierre Kolb — MIT License

   Every command: run(args, io, ctx) — io prints (say, err, dim, table, …),
   ctx = { name, rest, line, shell }. The help texts are i18n keys of the
   'terminal' namespace; `man <command>` reads usage/man keys the same way. */

import Desk from '../../../core/api.js';
import { textOf } from '../registry.js';

const t = (key, params) => Desk.t(`terminal.${key}`, params);

export default {
	help: {
		help: '@terminal.cmd.help',
		usage: '@terminal.usage.help',
		man: '@terminal.man.help',
		run(args, io, { shell }) {
			io.heading(t('helpTitle', { version: Desk.version }));
			io.table(shell.commands.list().map(e => [`  ${e.name}`, textOf(e.def.help, Desk.L)]));
			io.dim(t('helpMore'));
		}
	},

	history: {
		help: '@terminal.cmd.history',
		usage: '@terminal.usage.history',
		man: '@terminal.man.history',
		complete: () => ['-c'],
		run(args, io, { shell }) {
			if (args.includes('-c')) {
				shell.clearHistory();
				return;
			}
			const list = shell.history();
			const pad = String(list.length).length;
			list.forEach((c, i) => io.say(`${String(i + 1).padStart(pad + 2)}  ${c}`, 'term-pre'));
		}
	},

	clear: {
		/* the shortcut as this keyboard spells it (Ctrl or ⌘) */
		help: () => Desk.t('terminal.cmd.clear', { keys: Desk.i18n.keys('Mod+L') }),
		man: () => Desk.t('terminal.man.clear', { keys: Desk.i18n.keys('Mod+L') }),
		run(args, io) {
			io.clear();
		}
	},

	echo: {
		help: '@terminal.cmd.echo',
		usage: '@terminal.usage.echo',
		run(args, io, { rest }) {
			io.say(rest);
		}
	},

	search: {
		help: '@terminal.cmd.search',
		usage: '@terminal.usage.search',
		man: '@terminal.man.search',
		when: () => !!Desk.search,
		run(args, io, { rest }) {
			Desk.searchFor(rest.slice(0, 200));
		}
	},

	exit: {
		help: '@terminal.cmd.exit',
		run(args, io, { shell }) {
			io.dim(t('exit'));
			shell.close();
		}
	}
};
