/* JPKCom Desktop — terminal: easter eggs (hidden commands, config.terminal.eggs) — © Jean Pierre Kolb — MIT License

   Not in help, not completed — found by those who try. Registered as weak
   commands: a module or plugin that brings a real command of the same name
   replaces the egg. */

import Desk from '../../../core/api.js';

const t = (key, params) => Desk.t(`terminal.${key}`, params);

/** RFC 2324 / 7168 — the teapot that refuses to brew coffee */
export const TEAPOT = Object.freeze([
	'             ;,\'',
	'     _o_    ;:;\'',
	' ,-.\'---`.__ ;',
	'((j`=====\',-\'',
	' `-\\     /',
	'    `-=-\''
]);

const sudo = { hidden: true, run: (args, io, { shell }) => io.err(t('sudo', { user: shell.user() })) };

const rm = {
	hidden: true,
	run(args, io, { shell }) {
		if (args.some(a => /^-[a-z]*r/i.test(a)) && args.some(a => a === '/' || a === '/*' || a === '~')) {
			shell.shake();
			io.err(t('rmRoot'));
		} else {
			io.err(t('rm'));
		}
	}
};

const editor = {
	hidden: true,
	run(args, io) {
		io.say(t('editor'));
		if (!Desk.launch('editor')) io.err(t('cannotOpen', { name: 'editor' }));
	}
};

const coffee = {
	hidden: true,
	run(args, io) {
		for (const l of TEAPOT) io.say(l, 'term-pre term-art term-logo');
		io.blank();
		io.say(t('coffee'));
	}
};

const update = {
	hidden: true,
	run(args, io) {
		io.dim(t('update'));
		io.say(t('upToDate', { name: Desk.L(Desk.config.brand.name), version: Desk.version }));
	}
};

const hello = { hidden: true, run: (args, io) => io.say(t('hello')) };

export default {
	sudo, rm,
	vim: editor, vi: editor, nano: editor, emacs: editor,
	coffee, brew: coffee, tea: coffee, tee: coffee,
	update,
	hello, hi: hello, hallo: hello, moin: hello, servus: hello
};
