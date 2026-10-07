/* JPKCom Desktop — image viewer: pure helpers (formats, ratio, SVG size) — © Jean Pierre Kolb — MIT License

   No DOM, no imports — tests/p04-viewer.test.mjs checks these in Node. */

/** MIME type → format name shown in the info bar */
export const FORMATS = Object.freeze({
	'image/png': 'PNG', 'image/jpeg': 'JPEG', 'image/gif': 'GIF', 'image/webp': 'WebP', 'image/avif': 'AVIF',
	'image/svg+xml': 'SVG', 'image/bmp': 'BMP', 'image/x-icon': 'ICO', 'image/vnd.microsoft.icon': 'ICO'
});

/** File extension → MIME type (some systems send files without a type) */
export const BY_EXT = Object.freeze({
	png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
	avif: 'image/avif', svg: 'image/svg+xml', bmp: 'image/bmp', ico: 'image/x-icon'
});

/** The file picker's accept list */
export const ACCEPT = Object.keys(FORMATS).join(',');

/** Largest picture the viewer opens from the device (bytes) */
export const MAX_BYTES = 50 * 1024 * 1024;

/** Largest SVG whose text is read for its own size (bytes) */
export const MAX_SVG_TEXT = 5 * 1024 * 1024;

/** 'Photo.JPG?x=1#y' → 'jpg' */
export const extOf = name => {
	const base = String(name || '').split(/[?#]/)[0].split('/').pop();
	return base.includes('.') ? base.split('.').pop().toLowerCase() : '';
};

/** The last path segment of a URL or path ('a/b/logo.svg?x' → 'logo.svg') */
export const baseName = url => String(url || '').split(/[?#]/)[0].split('/').filter(Boolean).pop() || '';

/** Can the viewer show this file? (by type, else by extension) */
export const isImageFile = file => !!file && (!!FORMATS[file.type] || !!BY_EXT[extOf(file.name)]);

/** The MIME type to describe: the blob's own when known, else from the file name */
export const typeOf = (type, fileName) => (FORMATS[type] ? type : BY_EXT[extOf(fileName)] || type || '');

/** The type a device file's blob URL gets: a known image type, anything else 'application/octet-stream' */
export const blobType = (type, fileName) => {
	const known = typeOf(type, fileName);
	return FORMATS[known] ? known : 'application/octet-stream';
};

/**
 * How a device picture reaches its <img>: 'data' for an SVG (an SVG is a document type — in a blob:
 * URL of the desktop's origin, navigated to as a page, its script would run with the desktop's
 * storage; a data: URL cannot be navigated to by a page and never gets the desktop's origin),
 * 'blob' for raster types (a blob URL typed as a picture only ever renders as a picture).
 */
export const deviceSource = (type, fileName) => (blobType(type, fileName) === 'image/svg+xml' ? 'data' : 'blob');

/** 'image/svg+xml' → 'SVG'; unknown 'image/x-foo' → 'X-FOO' */
export const formatName = type => FORMATS[type] || String(type || '').replace(/^image\//, '').toUpperCase();

/**
 * Number format options for megapixels: one decimal from 1 MP on, two significant digits below
 * (a 64×48 icon is 0.0031 MP, not "0 MP").
 */
export const megapixelFormat = mp => (mp >= 1 ? { maximumFractionDigits: 1 } : { maximumSignificantDigits: 2 });

export const gcd = (a, b) => (b ? gcd(b, a % b) : a);

/**
 * Aspect ratio: '16:9' when it reduces to small whole numbers, else null (the
 * caller shows a decimal 'n:1' through the number formatter).
 */
export function ratioParts(w, hgt) {
	if (!(w > 0 && hgt > 0)) return null;
	if (Number.isInteger(w) && Number.isInteger(hgt)) {
		const g = gcd(w, hgt);
		if (w / g <= 32 && hgt / g <= 32) return { a: w / g, b: hgt / g };
	}
	return null;
}

/* '120', '120px', ' 120.5 px ' → number; '50%', '10em' → NaN */
export const px = v => (/^\s*[\d.]+\s*(px)?\s*$/.test(v || '') ? parseFloat(v) : NaN);

/**
 * An SVG's own size from its root attributes: width/height in px, else its
 * viewBox (browsers fall back to 150 or 300 px for an <img> of an SVG that has
 * only a viewBox). → { w, h, box } | null
 */
export function svgSizeFromAttrs(width, height, viewBox) {
	const w = px(width);
	const hgt = px(height);
	if (w > 0 && hgt > 0) return { w, h: hgt, box: false };
	const vb = String(viewBox || '').trim().split(/[\s,]+/).map(Number);
	return vb.length === 4 && vb[2] > 0 && vb[3] > 0 ? { w: vb[2], h: vb[3], box: true } : null;
}
