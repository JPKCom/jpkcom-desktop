/* JPKCom Desktop — media players: the shared list of audio and video file types — © Jean Pierre Kolb — MIT License

   ONE list for everything that decides whether a file is music or a video:
   the players' file pickers (accept), the check when files are added, and the
   'files' contributions the shell's drop handling reads (descriptor
   files.audio / files.video carry these extensions as `accept`). Other code
   imports it from here or reads it from the contribution or from the
   service: Desk.media.types().

   A file is sorted by its MIME type first, else by its extension (some
   systems send no type) — exactly as the original did. Pure: works in Node. */

/** Extensions per kind (lower case, with the dot) */
export const EXTENSIONS = Object.freeze({
	audio: Object.freeze(['.mp3', '.m4a', '.m4b', '.aac', '.wav', '.wave', '.ogg', '.oga', '.opus', '.flac', '.weba']),
	video: Object.freeze(['.mp4', '.m4v', '.webm', '.ogv', '.mov', '.mkv'])
});

/** MIME patterns per kind */
export const MIME = Object.freeze({
	audio: /^audio\//,
	video: /^video\//
});

export const KINDS = Object.freeze(['audio', 'video']);

const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const extRe = list => new RegExp(`(${list.map(escape).join('|')})$`, 'i');

/** Extension tests per kind: EXT.audio.test('song.MP3') */
export const EXT = Object.freeze({
	audio: extRe(EXTENSIONS.audio),
	video: extRe(EXTENSIONS.video)
});

/** The accept attribute of the file pickers: 'audio/*,.mp3,…' */
export const ACCEPT = Object.freeze({
	audio: ['audio/*', ...EXTENSIONS.audio].join(','),
	video: ['video/*', ...EXTENSIONS.video].join(',')
});

/** Display names of the formats (factual file format names, the same in every language) */
export const FORMATS = Object.freeze({
	mp3: 'MP3', m4a: 'MPEG-4 Audio', m4b: 'MPEG-4 Audio', aac: 'AAC', wav: 'WAV', wave: 'WAV', ogg: 'Ogg',
	oga: 'Ogg', opus: 'Opus', flac: 'FLAC', weba: 'WebM Audio', mp4: 'MPEG-4', m4v: 'MPEG-4', webm: 'WebM',
	ogv: 'Ogg Video', mov: 'MOV', mkv: 'Matroska'
});

/** Media type per extension (without the dot): the type a blob URL gets when the file brings none */
export const MEDIA_TYPES = Object.freeze({
	mp3: 'audio/mpeg', m4a: 'audio/mp4', m4b: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', wave: 'audio/wav',
	ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', flac: 'audio/flac', weba: 'audio/webm',
	mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg', mov: 'video/quicktime', mkv: 'video/x-matroska'
});

/** 'audio' | 'video' | null for { name, type }: by MIME type, else by extension */
export function kindOf(file) {
	const type = String(file?.type ?? '');
	const name = String(file?.name ?? '');
	if (MIME.video.test(type)) return 'video';
	if (MIME.audio.test(type)) return 'audio';
	if (EXT.video.test(name)) return 'video';
	if (EXT.audio.test(name)) return 'audio';
	return null;
}

/** 'mp3' for 'Song.MP3'; '' without an extension */
export const extOf = name => (/\.([^./\\]+)$/.exec(String(name ?? ''))?.[1] ?? '').toLowerCase();

/** The name without its extension: 'Song.mp3' → 'Song' */
export const stem = name => String(name ?? '').replace(/\.[^./\\]+$/, '');

/** The format line of the info bar: a known name, else the MIME type, else the extension in capitals, else '' */
export function formatName(name, type) {
	const ext = extOf(name);
	return FORMATS[ext] || String(type || '') || ext.toUpperCase();
}

/** A plain copy for other code (service media.types()) */
export function types() {
	return {
		extensions: { audio: [...EXTENSIONS.audio], video: [...EXTENSIONS.video] },
		mime: { audio: MIME.audio, video: MIME.video },
		accept: { ...ACCEPT },
		formats: { ...FORMATS }
	};
}
