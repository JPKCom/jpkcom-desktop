/* JPKCom Desktop — Notes app: stored data, validation, titles, search — © Jean Pierre Kolb — MIT License

   Pure (the tests import it). Storage key 'notes':
     { notes: [{ id, text, created, modified }], current: id | null }
   The first non-empty line of a note is its title, the second its preview. */

import { isId, isNum, newId } from '../kit.js';

/** One stored note → cleaned, or null */
export const cleanNote = n => (n && typeof n === 'object' && isId(n.id) && typeof n.text === 'string' && isNum(n.created) && isNum(n.modified)
	? { id: n.id, text: n.text, created: n.created, modified: n.modified } : null);

/** The stored value → cleaned { notes, current } (duplicate ids dropped), or null when it is no object */
export function cleanNotes(v) {
	if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
	const seen = new Set();
	const notes = (Array.isArray(v.notes) ? v.notes : []).map(cleanNote).filter(n => n && !seen.has(n.id) && seen.add(n.id));
	const current = isId(v.current) && seen.has(v.current) ? v.current : (notes[0]?.id ?? null);
	return { notes, current };
}

const lines = text => text.split('\n').map(l => l.trim()).filter(Boolean);

/** The title of a note (first line, 80 characters), or null for an empty note */
export const titleOf = text => lines(text)[0]?.slice(0, 80) ?? null;

/** The preview of a note (second line, 120 characters), or null */
export const previewOf = text => lines(text)[1]?.slice(0, 120) ?? null;

/** Notes matching a query (case-insensitive substring), newest first */
export function search(notes, query) {
	const q = String(query ?? '').trim().toLowerCase();
	return notes.filter(n => !q || n.text.toLowerCase().includes(q)).sort((a, b) => b.modified - a.modified);
}

/** Drops notes without text, except the one with id keep. Returns the new list. */
export const dropEmpty = (notes, keep) => notes.filter(n => n.id === keep || n.text.trim());

/** A note coming back from the trash becomes the current one (a new id when its old one is taken) */
export function restoreNote(data, n) {
	const note = cleanNote(n);
	if (!note) return null;
	if (data.notes.some(x => x.id === note.id)) note.id = newId();
	return { notes: [...data.notes, note], current: note.id };
}
