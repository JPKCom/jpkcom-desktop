/* JPKCom Desktop — tests: media tag reader (ID3v2.2/2.3/2.4, FLAC) with synthetic buffers — © Jean Pierre Kolb — MIT License */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	parseId3, parseFlac, parseTags, readTags, cleanTags, unsync, id3Text, id3Picture, isId3, isFlac
} from '../src/apps/media/tags.js';

/* ---------- Builders ---------- */

const enc = new TextEncoder();
const bytes = (...parts) => {
	const arrs = parts.map(p => (typeof p === 'string' ? latin1(p) : p instanceof Uint8Array ? p : Uint8Array.from(p)));
	const out = new Uint8Array(arrs.reduce((n, a) => n + a.length, 0));
	let o = 0;
	for (const a of arrs) {
		out.set(a, o);
		o += a.length;
	}
	return out;
};
const latin1 = s => Uint8Array.from([...s].map(c => c.charCodeAt(0) & 0xff));
const syncsafe = n => [(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f];
const be32 = n => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const be24 = n => [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
const le32 = n => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];
const utf16le = s => {
	const out = [0xff, 0xfe];
	for (const c of s) {
		const code = c.charCodeAt(0);
		out.push(code & 0xff, code >> 8);
	}
	return Uint8Array.from(out);
};
const utf16be = s => {
	const out = [];
	for (const c of s) {
		const code = c.charCodeAt(0);
		out.push(code >> 8, code & 0xff);
	}
	return Uint8Array.from(out);
};
/* A fake picture: a JPEG start plus filler (longer than 16 bytes) */
const JPEG = bytes([0xff, 0xd8, 0xff, 0xe0], new Uint8Array(40).fill(7));

const frame3 = (id, data, flags = [0, 0]) => bytes(id, be32(data.length), flags, data);
const frame4 = (id, data, flags = [0, 0]) => bytes(id, syncsafe(data.length), flags, data);
const frame2 = (id, data) => bytes(id, be24(data.length), data);
const tag = (ver, flags, body, padding = 16) => bytes('ID3', [ver, 0, flags], syncsafe(body.length + padding), body, new Uint8Array(padding));

/* ---------- ID3 ---------- */

test('detects ID3 and FLAC starts', () => {
	assert.equal(isId3(tag(3, 0, new Uint8Array())), true);
	assert.equal(isFlac(bytes('fLaC', [0x80, 0, 0, 0])), true);
	assert.equal(isId3(bytes('RIFF....WAVE')), false);
	assert.equal(parseTags(bytes('OggS', new Uint8Array(20))), null);
});

test('ID3v2.3: Latin-1 and UTF-16 text, APIC cover, padding ends the frames', () => {
	const body = bytes(
		frame3('TIT2', bytes([0], 'Caf\xe9')),
		frame3('TPE1', bytes([1], utf16le('Ärzte'))),
		frame3('TALB', bytes([3], enc.encode('Grüße'))),
		frame3('TYER', bytes([0], '1999')),
		frame3('TRCK', bytes([0], '3/12')),
		frame3('TCON', bytes([0], '(17)')),
		frame3('APIC', bytes([0], 'image/jpg', [0], [3], 'front', [0], JPEG))
	);
	const raw = parseId3(tag(3, 0, body));
	assert.equal(raw.title, 'Café');
	assert.equal(raw.artist, 'Ärzte');
	assert.equal(raw.album, 'Grüße');
	assert.equal(raw.cover.type, 'image/jpeg');
	assert.equal(raw.cover.bytes.length, JPEG.length);
	const tags = cleanTags(raw);
	assert.deepEqual({ ...tags, cover: undefined }, { title: 'Café', artist: 'Ärzte', album: 'Grüße', year: '1999', track: '3/12', cover: undefined });
	assert.equal(tags.genre, undefined, 'a bare genre reference (17) is dropped');
});

test('ID3v2.3: the first frame of a kind wins; several values are joined', () => {
	const body = bytes(
		frame3('TPE1', bytes([0], 'One\0Two')),
		frame3('TPE1', bytes([0], 'Ignored'))
	);
	assert.equal(parseId3(tag(3, 0, body)).artist, 'One / Two');
});

test('ID3v2.3: compressed/encrypted frames are skipped, the group byte is skipped', () => {
	const body = bytes(
		frame3('TIT2', bytes([0], 'secret'), [0, 0x80]),
		frame3('TALB', bytes([0x42], [0], 'Grouped'), [0, 0x20]),
		frame3('TIT2', bytes([0], 'Plain'))
	);
	const raw = parseId3(tag(3, 0, body));
	assert.equal(raw.title, 'Plain');
	assert.equal(raw.album, 'Grouped');
});

test('ID3v2.3: extended header and whole-tag unsynchronisation', () => {
	const ext = bytes(be32(6), [0, 0, 0, 0, 0, 0]);   // size excludes the 4 size bytes
	const frames = frame3('APIC', bytes([0], 'image/png', [0], [3], [0], [0x89, 0x50, 0xff, 0x00], new Uint8Array(30).fill(1)));
	/* Unsynchronise: every FF is followed by an inserted 00 */
	const raw = bytes(ext, frames);
	const out = [];
	for (let i = 0; i < raw.length; i++) {
		out.push(raw[i]);
		if (raw[i] === 0xff) out.push(0);
	}
	const parsed = parseId3(tag(3, 0x80 | 0x40, Uint8Array.from(out)));
	assert.equal(parsed.cover.type, 'image/png');
	assert.deepEqual([...parsed.cover.bytes.subarray(0, 4)], [0x89, 0x50, 0xff, 0x00]);
});

test('ID3v2.4: syncsafe frame sizes, UTF-16BE, data length indicator, per-frame unsync, TDRC year', () => {
	const unsynced = bytes([0], 'A', [0xff, 0x00], 'B');   // "A\xffB" after undoing
	const body = bytes(
		frame4('TIT2', bytes([2], utf16be('Größe'))),
		frame4('TPE1', bytes(be32(4), [3], enc.encode('Ünï')), [0, 0x01]),
		frame4('TALB', unsynced, [0, 0x02]),
		frame4('TDRC', bytes([3], enc.encode('2021-05-04T10:00'))),
		frame4('TCON', bytes([3], enc.encode('Jazz'))),
		frame4('TRCK', bytes([3], enc.encode('zipped')), [0, 0x08])
	);
	const tags = cleanTags(parseId3(tag(4, 0, body)));
	assert.equal(tags.title, 'Größe');
	assert.equal(tags.artist, 'Ünï');
	assert.equal(tags.album, 'AÿB');
	assert.equal(tags.year, '2021');
	assert.equal(tags.genre, 'Jazz');
	assert.equal(tags.track, undefined, 'compressed frame stays unread');
});

test('ID3v2.4: extended header (syncsafe size including itself)', () => {
	const ext = bytes(syncsafe(6), [1, 0]);
	const tags = cleanTags(parseId3(tag(4, 0x40, bytes(ext, frame4('TIT2', bytes([3], enc.encode('Hi')))))));
	assert.equal(tags.title, 'Hi');
});

test('ID3v2.2: three-letter frames and PIC', () => {
	const body = bytes(
		frame2('TT2', bytes([0], 'Old Song')),
		frame2('TP1', bytes([0], 'Band')),
		frame2('PIC', bytes([0], 'PNG', [3], 'desc', [0], new Uint8Array(30).fill(9)))
	);
	const tags = cleanTags(parseId3(tag(2, 0, body)));
	assert.equal(tags.title, 'Old Song');
	assert.equal(tags.artist, 'Band');
	assert.equal(tags.cover.type, 'image/png');
	assert.equal(tags.cover.bytes.length, 30);
});

test('ID3: unsupported versions, truncated frames and junk do not throw', () => {
	assert.equal(parseId3(bytes('ID3', [5, 0, 0], syncsafe(10), new Uint8Array(10))), null);
	const truncated = bytes('ID3', [3, 0, 0], syncsafe(30), 'TIT2', be32(9999), [0, 0], [0], 'x');
	assert.deepEqual(parseId3(truncated), {});
	assert.equal(parseTags(truncated), null);
	assert.equal(parseTags(bytes('ID3', [3, 0, 0], [0x7f, 0x7f, 0x7f, 0x7f])), null);
});

test('id3Picture: UTF-16 descriptions end with two zero bytes; tiny or foreign pictures are refused', () => {
	const pic = id3Picture(bytes([1], 'image/jpeg', [0], [3], utf16le('d'), [0, 0], JPEG), 3);
	assert.equal(pic.type, 'image/jpeg');
	assert.equal(pic.bytes.length, JPEG.length);
	assert.equal(id3Picture(bytes([0], 'image/jpeg', [0], [3], [0], [1, 2, 3]), 3), null);
	assert.equal(id3Picture(bytes([0], 'image/tiff', [0], [3], [0], JPEG), 3), null);
	assert.equal(id3Picture(bytes([0], 'image/jpeg'), 3), null, 'no MIME terminator');
});

test('unsync and id3Text helpers', () => {
	assert.deepEqual([...unsync(Uint8Array.from([0xff, 0x00, 0xe0, 0xff, 0x00, 0x00]))], [0xff, 0xe0, 0xff, 0x00]);
	assert.equal(id3Text(bytes([1], utf16le('hé'))), 'hé');
	assert.equal(id3Text(bytes([3], enc.encode('a\0\0b'))), 'a / b');
});

/* ---------- FLAC ---------- */

const vorbisBlock = (vendor, comments) => bytes(
	le32(vendor.length), enc.encode(vendor), le32(comments.length),
	...comments.map(c => bytes(le32(enc.encode(c).length), enc.encode(c))));
const pictureBlock = (mime, data) => bytes(be32(3), be32(mime.length), mime, be32(4), 'desc', new Uint8Array(16), be32(data.length), data);
const block = (type, data, last = false) => bytes([(last ? 0x80 : 0) | type], be24(data.length), data);

test('FLAC: Vorbis comments (case-insensitive keys, first wins) and PICTURE', () => {
	const flac = bytes('fLaC',
		block(0, new Uint8Array(34)),
		block(4, vorbisBlock('ref', ['title=Morning', 'ARTIST=Choir', 'Artist=Other', 'ALBUM=Hymns', 'DATE=2003-01-01', 'TRACKNUMBER=7', 'GENRE=Classical', 'COMMENT=x', 'novalue'])),
		block(6, pictureBlock('image/jpg', JPEG), true),
		new Uint8Array(100));
	const tags = parseTags(flac);
	assert.equal(tags.title, 'Morning');
	assert.equal(tags.artist, 'Choir');
	assert.equal(tags.album, 'Hymns');
	assert.equal(tags.year, '2003');
	assert.equal(tags.track, '7');
	assert.equal(tags.genre, 'Classical');
	assert.equal(tags.cover.type, 'image/jpeg');
	assert.equal(tags.cover.bytes.length, JPEG.length);
});

test('FLAC: a block running past the data stops quietly; a picture of another type is ignored', () => {
	const flac = bytes('fLaC', block(6, pictureBlock('image/bmp', JPEG)), [4, 0xff, 0xff, 0xff], 'x');
	assert.deepEqual(parseFlac(flac), { cover: null });
	assert.equal(parseTags(flac), null);
});

/* ---------- Cleaning, reading from a Blob ---------- */

test('cleanTags: control characters, length, year digits, empty → null', () => {
	const long = 'x'.repeat(300);
	const tags = cleanTags({ title: ' a\u0001b\u007f ', artist: long, year: 'ca. 1984/85', track: 7, genre: '(255)' });
	assert.equal(tags.title, 'a b');
	assert.equal(tags.artist.length, 200);
	assert.equal(tags.year, '1984');
	assert.equal(tags.track, undefined, 'non-strings are dropped');
	assert.equal(cleanTags({ title: '  ', year: 'none' }), null);
	assert.equal(cleanTags(null), null);
	assert.equal(cleanTags({ cover: { type: 'image/jpeg', bytes: 'nope' } }), null);
});

test('readTags reads only the tag from a Blob and survives junk', async () => {
	const body = frame3('TIT2', bytes([0], 'From Blob'));
	const file = new Blob([tag(3, 0, body), new Uint8Array(5000)]);
	assert.equal((await readTags(file)).title, 'From Blob');
	assert.equal(await readTags(new Blob([new Uint8Array(3)])), null);
	assert.equal(await readTags(new Blob(['plain text, no tags at all'])), null);
	assert.equal(await readTags({ slice() { throw new Error('gone'); } }), null);
	const flac = new Blob([bytes('fLaC', block(4, vorbisBlock('v', ['TITLE=Flac Blob']), true))]);
	assert.equal((await readTags(flac)).title, 'Flac Blob');
});
