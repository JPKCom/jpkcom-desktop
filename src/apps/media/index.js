/* JPKCom Desktop — media players: the apps "Audio Player" and "Video Player" — © Jean Pierre Kolb — MIT License

   One module, two apps ('audio', 'video'), one implementation (player.js).
   Files come from the device and play from blob URLs — nothing is uploaded
   and nothing is stored. MP3 (ID3v2) and FLAC tags give title, artist, album
   and cover (tags.js, read locally).

   This file is the descriptor; the player window (player.js with tags.js,
   media.css) is loaded when the first player opens (app field load,
   windowStyles).

   Contributions:
     files.audio / files.video   drop handler of the shell: everything of one
                                 kind goes into that player's playlist at once.
                                 `accept` is THE shared extension list
                                 (types.js), `mime` the MIME pattern; open()
                                 sorts the files again by kind (MIME type
                                 first, then extension), so a file always ends
                                 up in the right player.
   Service 'media':
     open(files) → Promise<number>       sorts files into the players (launches
                                         them); resolves with the files added
     add(kind, files) → Promise<number>  files into one player, once its window
                                         is built (win.ready)
     kindOf(file) → 'audio' | 'video' | null
     types() → { extensions, mime, accept, formats }
   Config (optional section `media`, cleaned by validateConfig):
     { maxItems: 200, seekStep: 5 }

   Security: the players have no popOut and no locationOf on purpose — a file
   from the device must never open as a document in the desktop's origin. Keep
   it that way; the blob URLs carry a media type (util.js mediaBlob), and
   canPopOut/canLink (guards) are given here, so they hold before the window
   code is there. */

import { EXTENSIONS, MIME, KINDS, kindOf, types } from './types.js';
import { cleanMediaConfig } from './util.js';

export { EXTENSIONS, MIME, ACCEPT, kindOf, types } from './types.js';

let desk = null;

/**
 * Hooks the window manager asks without the window code (given directly, they win over player.js).
 * Defence in depth: never "Open in new tab" — a file from the device must not become a document;
 * every item comes from the device: a link (#app=audio) would only reopen an empty player.
 */
export const guards = Object.freeze({
	canPopOut: () => false,
	canLink: win => !(win.state.media?.snapshot().count > 0)
});

/**
 * Files into the player of one kind: opens (or shows) its window and adds them once the window is
 * built (its code loads with the first window). → Promise<number of files added>
 */
async function add(kind, files) {
	if (!KINDS.includes(kind)) return 0;
	const list = [...(files || [])];
	if (!list.length) return 0;
	const win = desk?.wm?.open(kind);
	if (!win || !(await win.ready)) return 0;
	return win.state.media?.add(list) ?? 0;
}

/** Sorts files into the players by kind (MIME type first, then extension). → Promise<number of files added> */
async function open(input) {
	const files = Array.isArray(input) ? input
		: input && typeof input.length === 'number' && !(typeof Blob !== 'undefined' && input instanceof Blob) ? [...input]
			: input ? [input] : [];
	/* The players open now, in this order (the last one in front); the files follow when each is built */
	const added = KINDS.map(kind => add(kind, files.filter(f => kindOf(f) === kind)));
	return (await Promise.all(added)).reduce((a, b) => a + b, 0);
}

/* The drop handler of the shell hands over all files of a handler at once (multiple: true).
   max: the player itself enforces its limit and says so, so the drop passes everything on. */
const dropHandler = (kind, order) => ({
	/* A phrase for shell.dropSub ('Opens {list}') */
	label: kind === 'audio' ? '@media.dropAudio' : '@media.dropVideo',
	icon: kind === 'audio' ? 'ti-music' : 'ti-movie',
	accept: [...EXTENSIONS[kind]],
	mime: MIME[kind],
	multiple: true,
	max: 10000,
	order,
	open: files => open(files)
});

export default {
	id: 'media',
	kind: 'app',
	requires: ['wm'],
	i18n: ['media'],
	windowStyles: ['media.css'],

	apps: [
		{
			id: 'audio', kind: 'app', icon: 'ti-music', tint: 'pink', size: [720, 520], name: '@media.audioName', desc: '@media.audioDesc', ...guards,
			load: () => import('./player.js').then(m => m.player('audio'))
		},
		{
			id: 'video', kind: 'app', icon: 'ti-movie', tint: 'indigo', size: [860, 560], name: '@media.videoName', desc: '@media.videoDesc', ...guards,
			load: () => import('./player.js').then(m => m.player('video'))
		}
	],

	files: {
		audio: dropHandler('audio', 60),
		video: dropHandler('video', 61)
	},

	configKey: 'media',
	validateConfig: (section, warn) => cleanMediaConfig(section, warn),

	setup(d) {
		desk = d;
		d.provide('media', Object.freeze({ open, add, kindOf, types }));
	}
};
