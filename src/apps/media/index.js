/* JPKCom Desktop — media players: the apps "Audio Player" and "Video Player" — © Jean Pierre Kolb — MIT License

   One module, two apps ('audio', 'video'), one implementation (player.js).
   Files come from the device and play from blob URLs — nothing is uploaded
   and nothing is stored. MP3 (ID3v2) and FLAC tags give title, artist, album
   and cover (tags.js, read locally).

   Contributions:
     files.audio / files.video   drop handler of the shell: everything of one
                                 kind goes into that player's playlist at once.
                                 `accept` is THE shared extension list
                                 (types.js), `mime` the MIME pattern; open()
                                 sorts the files again by kind (MIME type
                                 first, then extension), so a file always ends
                                 up in the right player.
   Service 'media':
     open(files) → number        sorts files into the players (launches them)
     add(kind, files) → number   files into one player
     kindOf(file) → 'audio' | 'video' | null
     types() → { extensions, mime, accept, formats }
   Config (optional section `media`, cleaned by validateConfig):
     { maxItems: 200, seekStep: 5 }

   Security: the players have no popOut and no locationOf on purpose — a file
   from the device must never open as a document in the desktop's origin. Keep
   it that way; the blob URLs carry a media type (util.js mediaBlob). */

import { player } from './player.js';
import { EXTENSIONS, MIME, KINDS, kindOf, types } from './types.js';
import { cleanMediaConfig } from './util.js';

export { EXTENSIONS, MIME, ACCEPT, kindOf, types } from './types.js';

let desk = null;

/** Files into the player of one kind: opens (or shows) its window and adds them. → number of files added */
function add(kind, files) {
	if (!KINDS.includes(kind)) return 0;
	const list = [...(files || [])];
	if (!list.length) return 0;
	const win = desk?.wm?.open(kind);
	return win?.state.media ? win.state.media.add(list) : 0;
}

/** Sorts files into the players by kind (MIME type first, then extension). → number of files added */
function open(input) {
	const files = Array.isArray(input) ? input
		: input && typeof input.length === 'number' && !(typeof Blob !== 'undefined' && input instanceof Blob) ? [...input]
			: input ? [input] : [];
	let n = 0;
	for (const kind of KINDS) {
		const mine = files.filter(f => kindOf(f) === kind);
		if (mine.length) n += add(kind, mine);
	}
	return n;
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
	styles: ['media.css'],

	apps: [
		{ id: 'audio', kind: 'app', icon: 'ti-music', tint: 'pink', size: [720, 520], name: '@media.audioName', desc: '@media.audioDesc', ...player('audio') },
		{ id: 'video', kind: 'app', icon: 'ti-movie', tint: 'indigo', size: [860, 560], name: '@media.videoName', desc: '@media.videoDesc', ...player('video') }
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
