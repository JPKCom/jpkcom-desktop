/* JPKCom Desktop — Tasks app: stored data, validation, list operations — © Jean Pierre Kolb — MIT License

   Pure (the tests import it). Storage key 'todos':
     { items: [{ id, text, done, created }], filter: 'all' | 'open' | 'done' } */

import { isId, isNum, newId } from '../kit.js';

export const FILTERS = Object.freeze(['all', 'open', 'done']);
/** Longest task text */
export const MAX_TEXT = 500;

/** One stored task → cleaned, or null */
export const cleanItem = x => (x && typeof x === 'object' && isId(x.id) && typeof x.text === 'string' && x.text.length <= MAX_TEXT
	&& typeof x.done === 'boolean' && isNum(x.created)
	? { id: x.id, text: x.text, done: x.done, created: x.created } : null);

/** The stored value → cleaned { items, filter } (duplicate ids dropped), or null when it is no object */
export function cleanTodos(v) {
	if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
	const seen = new Set();
	const items = (Array.isArray(v.items) ? v.items : []).map(cleanItem).filter(x => x && !seen.has(x.id) && seen.add(x.id));
	return { items, filter: FILTERS.includes(v.filter) ? v.filter : 'all' };
}

/** The tasks a filter shows */
export const visible = (items, filter) => items.filter(x => filter === 'all' || (filter === 'done') === x.done);

/** { open, done, all } */
export function counts(items) {
	const open = items.filter(x => !x.done).length;
	return { open, done: items.length - open, all: items.length };
}

/** Swaps a task with its neighbour (delta -1 / 1); returns a new list, or null when it cannot move */
export function moveItem(items, id, delta) {
	const i = items.findIndex(x => x.id === id);
	const j = i + delta;
	if (i < 0 || j < 0 || j >= items.length) return null;
	const out = [...items];
	[out[i], out[j]] = [out[j], out[i]];
	return out;
}

/** Sorts the tasks into the order of ids (after a drag); unknown ids keep their place at the end */
export function reorder(items, ids) {
	const pos = new Map(ids.map((id, i) => [id, i]));
	return items.map((x, i) => [pos.get(x.id) ?? ids.length + i, x]).sort((a, b) => a[0] - b[0]).map(p => p[1]);
}

/** A task coming back from the trash: a new id when its old one is taken again */
export function restoreItem(data, x) {
	const item = cleanItem(x);
	if (!item) return null;
	if (data.items.some(y => y.id === item.id)) item.id = newId();
	return { ...data, items: [...data.items, item] };
}
