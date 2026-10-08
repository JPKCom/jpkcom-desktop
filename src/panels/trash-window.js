/* JPKCom Desktop — trash window: the deleted items, put back or purge them, empty the bin — © Jean Pierre Kolb — MIT License

   Loaded when the trash window first opens (app field load in
   src/panels/index.js). The items, putBack()/purge() and the question before
   emptying live in trash.js; a change there redraws the open panels (views). */

import Desk from '../core/api.js';
import { DAYS, views, current, isAsking, confirmEmpty, putBack, purge } from './trash.js';

const { h, t, L, storage } = Desk;

const appOf = item => {
	const type = storage.trashType(item.type);
	const app = type?.app ? Desk.apps.get(type.app) : null;
	return { type, app };
};

function when(ms) {
	const d = new Date(ms);
	return new Date().toDateString() === d.toDateString()
		? Desk.i18n.fmtTime(d, { hour: '2-digit', minute: '2-digit' })
		: Desk.i18n.fmtDate(d, { day: 'numeric', month: 'short' });
}

function renderTrash(win) {
	const root = h('div', { class: 'panel trash-panel' });

	root.redraw = () => {
		const items = current();
		const focused = root.contains(document.activeElement) ? document.activeElement : null;
		const focusedId = focused?.closest?.('.trash-item')?.dataset.id;
		const focusedIndex = focusedId ? [...root.querySelectorAll('.trash-item')].findIndex(li => li.dataset.id === focusedId) : -1;
		const onEmpty = focused?.classList.contains('trash-empty');
		const title = Desk.apps.name(Desk.apps.get('trash')) || t('trash.title');

		const head = h('div', { class: 'trash-head' },
			h('div', {},
				h('h2', { tabindex: '-1', text: title }),
				h('p', { text: t('trash.intro', { n: DAYS }) })),
			h('button', {
				type: 'button', class: 'btn trash-empty', disabled: !items.length, 'aria-disabled': isAsking() ? 'true' : null, text: t('trash.empty'),
				onclick: () => confirmEmpty(win)
			}));

		const list = items.length
			? h('ul', { class: 'trash-list', 'aria-label': title }, [...items].reverse().map(x => {
				const { type, app } = appOf(x);
				const name = x.title || t('trash.untitled');
				const source = app ? Desk.apps.name(app) : type ? L(type.label) : x.type;
				return h('li', { class: 'trash-item', 'data-id': x.id },
					app ? Desk.tile(app) : Desk.tile({ icon: type?.icon ?? 'ti-file-unknown', tint: 'graphite' }),
					h('span', { class: 'trash-text' },
						h('span', { class: 'trash-name', text: name }),
						h('span', { class: 'trash-meta', text: t('trash.meta', { source, when: when(x.deleted) }) })),
					h('button', {
						type: 'button', class: 'btn trash-back', text: t('trash.putBack'),
						'aria-label': t('trash.putBackItem', { name }), disabled: !type,
						title: type ? null : t('trash.noType'),
						onclick: () => putBack(x.id)
					}),
					h('button', {
						type: 'button', class: 'win-btn trash-purge', 'aria-label': t('trash.purgeItem', { name }), title: t('trash.purge'),
						onclick: () => purge(x.id)
					}, Desk.icon('ti-x')));
			}))
			: h('p', { class: 'trash-none', text: t('trash.none') });

		root.replaceChildren(head, list);

		/* Keep the keyboard where it was: the same item, else the one that took its place, else the heading */
		if (onEmpty) {
			(root.querySelector('.trash-empty:not(:disabled)') ?? root.querySelector('h2'))?.focus({ preventScroll: true });
		} else if (focusedId) {
			const sel = `.trash-item[data-id="${Desk.dom.cssEscape(focusedId)}"]`;
			const same = root.querySelector(sel);
			const was = focused?.classList.contains('trash-purge') ? '.trash-purge' : '.trash-back';
			const next = same ?? root.querySelectorAll('.trash-item')[Math.max(0, focusedIndex - 1)] ?? null;
			const btn = next?.querySelector(`${was}:not(:disabled)`) ?? next?.querySelector('button:not(:disabled)');
			(btn ?? root.querySelector('h2'))?.focus({ preventScroll: true });
		}
	};

	views.add(root);
	root.redraw();
	return root;
}

export default { render: renderTrash };
