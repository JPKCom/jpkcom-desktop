/* JPKCom Desktop — example site app "Hello": a template for your own apps — © Jean Pierre Kolb — MIT License

   A small app that lives in site/, next to your content, and needs no change in src/. It shows what most
   apps need: a window (mount, relabel, unmount), its own texts in every language (locales/<lang>/hello.js,
   with a placeholder and a plural form), its own CSS (hello.css), a stored value with validation, backup
   and reset (storage, resetGroups, model.js) and one contribution to an extension point: the terminal
   command `hello`.

   Make it your own app
     1. Copy the folder: site/modules/hello/ → site/modules/<id>/ (id: a–z, 0–9 and '-', starting with a letter).
     2. Replace every `hello` / `Hello` in the folder with your id / name (a search-and-replace over the
        folder does it). That covers:
          - the id, the i18n namespace and every 'hello.…' / '@hello.…' key (also in the descriptor below);
          - the files locales/<lang>/hello.js and their texts (names, greetings, help of the command);
          - the storage key, the reset group (also in the storage:reset listener) and win.state.hello;
          - the terminal command `hello` and its usage: a second command of the same name is refused
            (the first registration wins), so your copy would silently lose its command;
          - the CSS classes 'hello', 'hello-input', … here and in hello.css (rename that file too and
            list the new name in styles), and the '-hello-name' suffix of the field id;
          - the helper cleanHello in model.js (optional, but keeps the names consistent).
     3. List it in site/config.js: apps: [ …, { id: '<id>', src: 'site/modules/<id>/index.js' } ].
     4. A new Tabler icon ('ti-…'): npm run icons. Then npm run i18n:check (each language of locales/
        needs its file in your locales/<lang>/) and npm run validate.
   More extension points — settings, shortcuts, search, context menu, calendar, a config section:
   docs/ARCHITECTURE.md §8 (module descriptor) and §21 (how to add …). */

import Desk from '../../../src/core/api.js';
import { cleanHello, clip, EMPTY, MAX_NAME } from './model.js';

const { h, t, store } = Desk;
const KEY = 'hello';

const load = () => store.getJson(KEY, cleanHello, null) ?? { ...EMPTY };
/* false when the browser keeps nothing (private window, full storage): the app works on regardless */
const save = data => store.setJson(KEY, data);

/* The greeting for a name ('' → the one that asks for it) */
const greeting = name => (name ? t('hello.greeting', { name }) : t('hello.greetingAnon'));

function mount(win, body) {
	/* The state lives here; storage only keeps it for the next visit */
	let data = load();
	data = { ...data, opens: data.opens + 1 };
	save(data);
	let greeted = false;

	const fieldId = `${win.id}-hello-name`;
	const field = h('input', { type: 'text', class: 'hello-input', id: fieldId, name: 'name', maxlength: String(MAX_NAME),
		autocomplete: 'off', props: { value: data.name } });
	const label = h('label', { class: 'hello-label', for: fieldId });
	const button = h('button', { type: 'submit', class: 'btn btn-primary' });
	const output = h('output', { class: 'hello-greeting', for: fieldId, 'aria-live': 'polite' });
	const opens = h('p', { class: 'hello-opens' });
	const form = h('form', { class: 'hello-form' }, label, h('div', { class: 'hello-row' }, field, button));
	body.append(h('div', { class: 'hello' }, form, output, opens));

	/* Every text in one place: mount, the language switch (relabel) and a changed state call it */
	function draw() {
		label.textContent = t('hello.nameLabel');
		field.placeholder = t('hello.namePlaceholder');
		button.textContent = t('hello.greet');
		output.textContent = greeted ? greeting(data.name) : '';
		opens.textContent = t('hello.opens', { n: data.opens });
	}

	form.addEventListener('submit', e => {
		e.preventDefault();
		data = { ...data, name: clip(field.value) };
		field.value = data.name;
		save(data);
		greeted = true;
		draw();
	});

	/* The stored state changed elsewhere: another tab, a restored backup, "Reset → Hello" in the settings */
	function refresh() {
		data = load();
		if (document.activeElement !== field) field.value = data.name;
		greeted = false;
		draw();
	}
	const offs = [
		Desk.on('store:change', ({ name, external } = {}) => { if (name === KEY && external) refresh(); }),
		Desk.on('storage:restore', ({ names } = {}) => { if (names?.includes(KEY)) refresh(); }),
		Desk.on('storage:reset', ({ groups } = {}) => { if (groups?.includes('hello')) refresh(); })
	];

	win.state.hello = { draw, field, off: () => offs.forEach(off => off()) };
	draw();
}

/* `hello [name]` in the terminal — a name given here wins over the saved one */
function helloCommand(args, io) {
	io.say(greeting(clip(args.join(' ')) || load().name));
}

export default {
	id: 'hello',
	kind: 'app',
	i18n: ['hello'],
	locales: 'locales/',            // the texts: locales/<lang>/hello.js next to this file
	styles: ['hello.css'],

	app: { icon: 'ti-mood-smile', tint: 'green', size: [420, 360], name: '@hello.appName', desc: '@hello.appDesc' },

	storage: {
		hello: { type: 'json', backup: true, reset: 'hello', label: '@hello.appName', validate: cleanHello }
	},
	resetGroups: [{ id: 'hello', label: '@hello.appName', hint: '@hello.resetHint', order: 60 }],

	terminal: {
		hello: { run: helloCommand, help: '@hello.cmd', usage: 'hello [name]', man: '@hello.cmdMan' }
	},

	mount,
	focus: win => win.state.hello.field.focus({ preventScroll: true }),
	relabel: win => win.state.hello.draw(),
	unmount: win => win.state.hello.off()
};
