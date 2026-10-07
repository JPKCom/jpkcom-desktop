/* JPKCom Desktop — media players: ID3v2 (MP3) and FLAC tag reader — © Jean Pierre Kolb — MIT License

   Reads title, artist, album, year, track, genre and the cover picture from a
   file on the device — locally, nothing is sent anywhere.

     ID3v2.2 / 2.3 / 2.4: unsynchronisation (whole tag, and per frame in 2.4),
       extended header, frame flags (compressed or encrypted frames stay unread,
       group byte and data length indicator are skipped), text encodings
       Latin-1, UTF-16 with BOM, UTF-16BE and UTF-8, several values joined with
       " / ", APIC (2.3/2.4) and PIC (2.2) pictures.
     FLAC: VORBIS_COMMENT and PICTURE metadata blocks.

   Strings are cleaned (no control characters, at most 200 characters, a year
   is its four digits, a bare ID3 genre reference "(17)" is dropped); covers
   only as JPEG, PNG, WebP or GIF.

   Pure: parseId3()/parseFlac() take a Uint8Array of the start of the file
   (tests feed them synthetic buffers); readTags(blob) slices a File/Blob. */

/** At most this much of a file is read for its tags (covers can be large) */
export const TAG_BYTES = 16 * 1024 * 1024;

const ID3_FRAMES = {
	TIT2: 'title', TPE1: 'artist', TALB: 'album', TYER: 'year', TDRC: 'year', TRCK: 'track', TCON: 'genre', APIC: 'cover',
	TT2: 'title', TP1: 'artist', TAL: 'album', TYE: 'year', TRK: 'track', TCO: 'genre', PIC: 'cover'
};
const VORBIS = { TITLE: 'title', ARTIST: 'artist', ALBUM: 'album', DATE: 'year', TRACKNUMBER: 'track', GENRE: 'genre' };
/* Raster types only. Never add SVG: an SVG cover is a document that can carry script, and a
   cover from a file on the device must never be able to run as one in the desktop's origin */
const COVER_TYPE = /^image\/(jpeg|png|webp|gif)$/;
const TEXT_KEYS = ['title', 'artist', 'album', 'year', 'track', 'genre'];

const syncsafe = (b, o) => ((b[o] & 0x7f) << 21) | ((b[o + 1] & 0x7f) << 14) | ((b[o + 2] & 0x7f) << 7) | (b[o + 3] & 0x7f);
const be32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const le32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const latin1 = b => new TextDecoder('latin1').decode(b);

/** 'ID3' at the start */
export const isId3 = b => b?.length >= 10 && b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33;
/** 'fLaC' at the start */
export const isFlac = b => b?.length >= 4 && b[0] === 0x66 && b[1] === 0x4c && b[2] === 0x61 && b[3] === 0x43;

/** FF 00 → FF: undoes ID3's "unsynchronisation" */
export function unsync(b) {
	const out = new Uint8Array(b.length);
	let n = 0;
	for (let i = 0; i < b.length; i++) {
		out[n++] = b[i];
		if (b[i] === 0xff && b[i + 1] === 0) i++;
	}
	return out.subarray(0, n);
}

/** ID3 text: 0 Latin-1, 1 UTF-16 with BOM, 2 UTF-16BE, 3 UTF-8; several values are 0-separated */
export function id3Text(data) {
	const enc = data[0];
	const body = data.subarray(1);
	const label = enc === 3 ? 'utf-8'
		: enc === 2 || (enc === 1 && body[0] === 0xfe && body[1] === 0xff) ? 'utf-16be'
			: enc === 1 ? 'utf-16le' : 'latin1';
	return new TextDecoder(label).decode(body).split('\0').filter(Boolean).join(' / ');
}

/** APIC (2.3/2.4: MIME type) or PIC (2.2: three-letter format) → { type, bytes } | null */
export function id3Picture(data, ver) {
	const enc = data[0];
	let p;
	let type;
	if (ver === 2) {
		type = latin1(data.subarray(1, 4)).toLowerCase() === 'png' ? 'image/png' : 'image/jpeg';
		p = 4;
	} else {
		const end = data.indexOf(0, 1);
		if (end < 0) return null;
		type = latin1(data.subarray(1, end)).toLowerCase();
		p = end + 1;
	}
	p++;   // picture type
	/* The description ends with one zero byte, or two in UTF-16 */
	if (enc === 1 || enc === 2) {
		while (p + 1 < data.length && (data[p] || data[p + 1])) p += 2;
		p += 2;
	} else {
		while (p < data.length && data[p]) p++;
		p++;
	}
	if (!type.includes('/')) type = `image/${type}`;
	type = type.replace('image/jpg', 'image/jpeg');
	const img = data.subarray(p);
	return COVER_TYPE.test(type) && img.length > 16 ? { type, bytes: img } : null;
}

/**
 * The raw frames of an ID3v2 tag. buf: the start of the file (header
 * included, at least the whole tag for every frame to be found).
 * → { title?, artist?, …, cover? } (uncleaned) | null
 */
export function parseId3(buf, maxBytes = TAG_BYTES) {
	if (!isId3(buf)) return null;
	const ver = buf[3];
	if (ver < 2 || ver > 4) return null;
	const flags = buf[5];
	let b = buf.subarray(10, 10 + Math.min(syncsafe(buf, 6), maxBytes));
	if (flags & 0x80 && ver < 4) b = unsync(b);
	let pos = 0;
	if (flags & 0x40 && ver > 2) pos = ver === 4 ? syncsafe(b, 0) : be32(b, 0) + 4;
	const idLen = ver === 2 ? 3 : 4;
	const headLen = ver === 2 ? 6 : 10;
	const tags = {};
	while (pos + headLen <= b.length) {
		const id = latin1(b.subarray(pos, pos + idLen));
		if (!/^[A-Z0-9]+$/.test(id)) break;   // padding
		const len = ver === 2 ? (b[pos + 3] << 16) | (b[pos + 4] << 8) | b[pos + 5] : ver === 4 ? syncsafe(b, pos + 4) : be32(b, pos + 4);
		const start = pos + headLen;
		if (!len || start + len > b.length) break;
		let data = b.subarray(start, start + len);
		pos = start + len;
		const f = ver === 2 ? 0 : b[start - 1];
		/* Compressed or encrypted frames stay unread; group byte and length indicator are skipped */
		if (ver === 4) {
			if (f & 0x0c) continue;
			data = data.subarray((f & 0x40 ? 1 : 0) + (f & 0x01 ? 4 : 0));
			if (f & 0x02) data = unsync(data);
		} else if (ver === 3) {
			if (f & 0xc0) continue;
			if (f & 0x20) data = data.subarray(1);
		}
		const key = ID3_FRAMES[id];
		if (!key || tags[key] || !data.length) continue;
		tags[key] = key === 'cover' ? id3Picture(data, ver) : id3Text(data);
	}
	return tags;
}

/** Fills tags from a VORBIS_COMMENT block (little-endian lengths) */
export function vorbisComments(b, tags = {}) {
	let p = 4 + le32(b, 0);   // vendor string
	const n = le32(b, p);
	p += 4;
	const utf8 = new TextDecoder('utf-8');
	for (let i = 0; i < n && p + 4 <= b.length; i++) {
		const len = le32(b, p);
		p += 4;
		if (p + len > b.length) break;
		const s = utf8.decode(b.subarray(p, p + len));
		p += len;
		const eq = s.indexOf('=');
		const key = eq > 0 && VORBIS[s.slice(0, eq).toUpperCase()];
		if (key && !tags[key]) tags[key] = s.slice(eq + 1);
	}
	return tags;
}

/** A FLAC PICTURE block (big-endian lengths) → { type, bytes } | null */
export function flacPicture(b) {
	let p = 4;   // picture type
	const mlen = be32(b, p);
	p += 4;
	const type = latin1(b.subarray(p, p + mlen)).toLowerCase().replace('image/jpg', 'image/jpeg');
	p += mlen;
	p += 4 + be32(b, p) + 16;   // description, then width, height, depth, colours
	const len = be32(b, p);
	p += 4;
	return COVER_TYPE.test(type) && len > 16 && p + len <= b.length ? { type, bytes: b.subarray(p, p + len) } : null;
}

/** The metadata blocks of a FLAC file. buf: the start of the file ('fLaC' included). → raw tags | null */
export function parseFlac(buf, maxBytes = TAG_BYTES) {
	if (!isFlac(buf)) return null;
	const b = buf.subarray(4, 4 + maxBytes);
	const tags = {};
	let pos = 0;
	while (pos + 4 <= b.length) {
		const last = b[pos] & 0x80;
		const type = b[pos] & 0x7f;
		const len = (b[pos + 1] << 16) | (b[pos + 2] << 8) | b[pos + 3];
		const start = pos + 4;
		if (start + len > b.length) break;
		const block = b.subarray(start, start + len);
		if (type === 4) vorbisComments(block, tags);
		else if (type === 6 && !tags.cover) tags.cover = flacPicture(block);
		if (last) break;
		pos = start + len;
	}
	return tags;
}

/** Plain, short strings only; a year is its four digits; an ID3 genre reference "(17)" alone says nothing */
export function cleanTags(raw) {
	if (!raw || typeof raw !== 'object') return null;
	const tags = {};
	for (const key of TEXT_KEYS) {
		let v = typeof raw[key] === 'string' ? raw[key].replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 200) : '';
		if (key === 'year') v = v.match(/\d{4}/)?.[0] || '';
		if (key === 'genre' && /^\(\d+\)$/.test(v)) v = '';
		if (v) tags[key] = v;
	}
	const c = raw.cover;
	if (c && COVER_TYPE.test(c.type) && c.bytes instanceof Uint8Array && c.bytes.length > 16) tags.cover = c;
	return Object.keys(tags).length ? tags : null;
}

/** Tags straight from the bytes of a file's start (ID3v2 or FLAC) → cleaned tags | null */
export function parseTags(buf, maxBytes = TAG_BYTES) {
	try {
		if (isId3(buf)) return cleanTags(parseId3(buf, maxBytes));
		if (isFlac(buf)) return cleanTags(parseFlac(buf, maxBytes));
	} catch { /* broken tag — the file name will do */ }
	return null;
}

/**
 * Reads the tags of a File/Blob: only as many bytes as the tag needs (at most
 * maxBytes). → { title?, artist?, album?, year?, track?, genre?, cover?: { type, bytes } } | null
 */
export async function readTags(file, maxBytes = TAG_BYTES) {
	try {
		const head = new Uint8Array(await file.slice(0, 10).arrayBuffer());
		if (isId3(head)) {
			const size = Math.min(syncsafe(head, 6), maxBytes);
			return parseTags(new Uint8Array(await file.slice(0, 10 + size).arrayBuffer()), maxBytes);
		}
		if (isFlac(head)) return parseTags(new Uint8Array(await file.slice(0, 4 + maxBytes).arrayBuffer()), maxBytes);
	} catch { /* unreadable — the file name will do */ }
	return null;
}
