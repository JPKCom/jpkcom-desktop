/* JPKCom Desktop — terminal: `browser` — everything the browser tells about itself, read locally — © Jean Pierre Kolb — MIT License

   Nothing of this leaves the device: user agent and client hints, screen,
   hardware, network, locale, accessibility preferences, permissions, this
   page and a matrix of web interfaces. Browser and system names are
   detected facts (nominative use), not product endorsements. */

import Desk from '../../../core/api.js';
import { fold } from '../lib.js';

const t = (key, params) => Desk.t(`terminal.${key}`, params);
const K = key => t(`bk.${key}`);
const V = key => (Desk.i18n.has(`terminal.bv.${key}`) ? t(`bv.${key}`) : key);

export const BI_SECTIONS = ['agent', 'system', 'screen', 'hardware', 'network', 'locale', 'prefs', 'privacy', 'page', 'features'];

/** A value from fn() with a time limit — null when it fails, is missing or takes too long */
export function within(fn, ms) {
	let p;
	try {
		p = Promise.resolve(fn());
	} catch {
		p = Promise.resolve(null);
	}
	return Promise.race([p.catch(() => null), new Promise(done => setTimeout(done, ms, null))]);
}

/** The first matching value of a media feature; null when the browser does not know the feature */
function media(feature, values) {
	if (matchMedia(`(${feature})`).media === 'not all') return null;
	return values.find(v => matchMedia(`(${feature}: ${v})`).matches) ?? null;
}

export const UA_BROWSERS = [
	['Microsoft Edge', /Edg(?:e|A|iOS)?\/([\d.]+)/],
	['Opera', /(?:OPR|OPiOS)\/([\d.]+)/],
	['Vivaldi', /Vivaldi\/([\d.]+)/],
	['Samsung Internet', /SamsungBrowser\/([\d.]+)/],
	['Firefox', /(?:Firefox|FxiOS)\/([\d.]+)/],
	['Chrome', /(?:Chrome|CriOS)\/([\d.]+)/],
	['Safari', /Version\/([\d.]+).*Safari\//]
];

/** Browser name and version from a user agent string → [name, version] | [null, null] */
export function uaBrowser(ua) {
	for (const [n, re] of UA_BROWSERS) {
		const m = String(ua).match(re);
		if (m) return [n, m[1]];
	}
	return [null, null];
}

/** From client hints: Windows 11 reports platform version 13 and up */
export function hintOs(platform, version) {
	const v = String(version || '').replace(/(\.0)+$/, '');
	if (platform === 'Windows') {
		const major = parseInt(version, 10);
		return Number.isFinite(major) ? (major >= 13 ? 'Windows 11' : major > 0 ? 'Windows 10' : 'Windows 7/8') : 'Windows';
	}
	return platform ? `${platform}${v ? ` ${v}` : ''}` : null;
}

/** From the user agent string (some systems freeze their version there); touch: navigator.maxTouchPoints */
export function uaOs(ua, touch = 0) {
	let m;
	if ((m = ua.match(/(?:iPhone|CPU) OS (\d+(?:_\d+)*)/))) return `${/iPad/.test(ua) ? 'iPadOS' : 'iOS'} ${m[1].replace(/_/g, '.')}`;
	if ((m = ua.match(/Android (\d+(?:\.\d+)*)/))) return `Android ${m[1]}`;
	if (/Windows NT 10/.test(ua)) return 'Windows 10/11';
	if ((m = ua.match(/Windows NT ([\d.]+)/))) return `Windows NT ${m[1]}`;
	if (/CrOS/.test(ua)) return 'ChromeOS';
	if (/Mac OS X/.test(ua)) return touch > 1 ? 'iPadOS' : 'macOS';
	if (/Linux/.test(ua)) return 'Linux';
	return null;
}

/* Chromium hides the real GPU behind "WebKit WebGL" unless asked through the debug
   extension; other engines give it directly and warn about that extension */
function webgl() {
	try {
		const gl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
		if (!gl) return null;
		let renderer = gl.getParameter(gl.RENDERER);
		let vendor = gl.getParameter(gl.VENDOR);
		if (/^WebKit/i.test(renderer)) {
			const dbg = gl.getExtension('WEBGL_debug_renderer_info');
			if (dbg) {
				renderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
				vendor = gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL);
			}
		}
		const out = {
			version: typeof WebGL2RenderingContext === 'function' && gl instanceof WebGL2RenderingContext ? 'WebGL 2' : 'WebGL 1',
			renderer: String(renderer || '').slice(0, 300), vendor: String(vendor || '').slice(0, 100),
			texture: gl.getParameter(gl.MAX_TEXTURE_SIZE)
		};
		gl.getExtension('WEBGL_lose_context')?.loseContext();
		return out;
	} catch {
		return null;
	}
}

async function webgpu() {
	const adapter = await navigator.gpu.requestAdapter();
	if (!adapter) return { text: null };
	const info = adapter.info || (adapter.requestAdapterInfo ? await adapter.requestAdapterInfo() : {});
	return { text: [info.vendor, info.architecture, info.description].filter(Boolean).join(' · ').slice(0, 200) };
}

/* Median gap of 30 animation frames */
function refreshRate() {
	return new Promise(done => {
		if (document.hidden) {
			done(null);
			return;
		}
		const times = [];
		const step = ts => {
			times.push(ts);
			if (times.length < 31) {
				requestAnimationFrame(step);
				return;
			}
			const gaps = times.slice(1).map((x, i) => x - times[i]).sort((a, b) => a - b);
			const mid = gaps[gaps.length >> 1];
			done(mid > 0 ? Math.round(1000 / mid) : null);
		};
		requestAnimationFrame(step);
	});
}

const FEATURES = [
	['Service Worker', () => 'serviceWorker' in navigator],
	['WebAssembly', () => typeof WebAssembly === 'object'],
	['WebGL 2', () => typeof WebGL2RenderingContext === 'function'],
	['WebGPU', () => 'gpu' in navigator],
	['WebCodecs', () => typeof VideoEncoder === 'function'],
	['WebRTC', () => typeof RTCPeerConnection === 'function'],
	['WebXR', () => 'xr' in navigator],
	['Web Share', () => typeof navigator.share === 'function'],
	['Clipboard', () => !!navigator.clipboard],
	['File System Access', () => 'showOpenFilePicker' in window],
	['Notifications', () => 'Notification' in window],
	['Push', () => 'PushManager' in window],
	['Web Bluetooth', () => 'bluetooth' in navigator],
	['WebUSB', () => 'usb' in navigator],
	['Web Serial', () => 'serial' in navigator],
	['WebHID', () => 'hid' in navigator],
	['Gamepad', () => typeof navigator.getGamepads === 'function'],
	['Vibration', () => typeof navigator.vibrate === 'function'],
	['Wake Lock', () => 'wakeLock' in navigator],
	['Web Speech', () => 'speechSynthesis' in window],
	['WebAuthn', () => typeof PublicKeyCredential === 'function'],
	['Payment Request', () => typeof PaymentRequest === 'function'],
	['Geolocation', () => 'geolocation' in navigator],
	['IndexedDB', () => 'indexedDB' in window],
	['OffscreenCanvas', () => typeof OffscreenCanvas === 'function'],
	['SharedArrayBuffer', () => typeof SharedArrayBuffer === 'function' && self.crossOriginIsolated === true],
	['Compression Streams', () => typeof CompressionStream === 'function'],
	['View Transitions', () => typeof document.startViewTransition === 'function'],
	['Popover', () => Object.hasOwn(HTMLElement.prototype, 'popover')],
	['CSS :has()', () => CSS.supports('selector(:has(a))')],
	['CSS Nesting', () => CSS.supports('selector(&)')],
	['Container Queries', () => CSS.supports('container-type: inline-size')],
	['Anchor Positioning', () => CSS.supports('anchor-name: --a')],
	['CSS color-mix()', () => CSS.supports('color: color-mix(in srgb, red, blue)')]
];

/** UTC offset like 'UTC+02:00' (minutes east of UTC) */
export function utcOffset(off) {
	return `UTC${off >= 0 ? '+' : '−'}${String(Math.floor(Math.abs(off) / 60)).padStart(2, '0')}:${String(Math.abs(off) % 60).padStart(2, '0')}`;
}

/* Everything the browser tells about itself, as sections of [label, value] rows */
async function browserFacts() {
	const nav = navigator;
	const uad = nav.userAgentData;
	const ua = nav.userAgent;
	const [hints, battery, persisted, geo, notify, gpu, hz] = await Promise.all([
		uad ? within(() => uad.getHighEntropyValues(['architecture', 'bitness', 'fullVersionList', 'model', 'platformVersion']), 1000) : null,
		within(() => nav.getBattery().then(b => ({ level: b.level, charging: b.charging })), 1000),
		within(() => nav.storage.persisted(), 1000),
		within(() => nav.permissions.query({ name: 'geolocation' }).then(s => s.state), 1000),
		within(() => nav.permissions.query({ name: 'notifications' }).then(s => s.state), 1000),
		'gpu' in nav ? within(webgpu, 1500) : null,
		within(refreshRate, 1500)
	]);
	const yn = b => (b == null ? null : V(b ? 'yes' : 'no'));
	const num = (n, digits = 0) => Desk.i18n.fmtNumber(n, { maximumFractionDigits: digits });

	/* Browser and engine: client hints first (Chromium), else the user agent string */
	const brands = (hints?.fullVersionList || uad?.brands || []).filter(b => !/not.?a.?brand/i.test(b.brand));
	const brand = brands.find(b => b.brand !== 'Chromium') || brands[0];
	const [name, version] = brand ? [brand.brand, brand.version] : uaBrowser(ua);
	const chromium = brands.find(b => b.brand === 'Chromium')?.version || ua.match(/Chrome\/([\d.]+)/)?.[1];
	/* Every browser on these devices runs on WebKit */
	const webkitOnly = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && nav.maxTouchPoints > 1);
	const engine = webkitOnly ? `WebKit ${ua.match(/AppleWebKit\/([\d.]+)/)?.[1] || ''}`
		: chromium ? `Blink ${chromium}`
		: /Gecko\/\d/.test(ua) ? `Gecko ${ua.match(/rv:([\d.]+)/)?.[1] || ''}`
		: `WebKit ${ua.match(/AppleWebKit\/([\d.]+)/)?.[1] || ''}`;

	const os = (hints && uad.platform ? hintOs(uad.platform, hints.platformVersion) : null) || uaOs(ua, nav.maxTouchPoints) || uad?.platform || nav.platform || null;
	const gl = webgl();
	const conn = nav.connection;
	const ro = Intl.DateTimeFormat().resolvedOptions();
	const nt = performance.getEntriesByType?.('navigation')?.[0];
	const dpr = devicePixelRatio || 1;
	const s = screen;
	const orient = s.orientation?.type;
	const mode = ['fullscreen', 'window-controls-overlay', 'standalone', 'minimal-ui', 'browser'].find(m => matchMedia(`(display-mode: ${m})`).matches);
	const pointer = media('pointer', ['fine', 'coarse', 'none']);
	const contrast = media('prefers-contrast', ['more', 'less', 'custom', 'no-preference']);
	const gamut = media('color-gamut', ['rec2020', 'p3', 'srgb']);
	const flag = (feature, on) => (matchMedia(`(${feature})`).media === 'not all' ? null : yn(matchMedia(`(${feature}: ${on})`).matches));
	const proto = { h2: 'HTTP/2', h3: 'HTTP/3', 'http/1.1': 'HTTP/1.1', 'http/1.0': 'HTTP/1.0' };
	const bits = n => t('bv.bits', { n: String(n) });

	const rows = {
		agent: [
			[K('name'), name],
			[K('version'), version],
			[K('engine'), engine.trim()],
			[K('mobile'), yn(uad ? uad.mobile : /Mobi|Android|iPhone/.test(ua))],
			[K('ua'), ua]
		],
		system: [
			[K('os'), os],
			[K('arch'), hints?.architecture ? `${hints.architecture}${hints.bitness ? ` · ${bits(hints.bitness)}` : ''}` : null],
			[K('model'), hints?.model || null],
			[K('platform'), nav.platform || null]
		],
		screen: [
			[K('screen'), `${s.width} × ${s.height}`],
			[K('physical'), `${Math.round(s.width * dpr)} × ${Math.round(s.height * dpr)}`],
			[K('avail'), `${s.availWidth} × ${s.availHeight}`],
			[K('viewport'), `${innerWidth} × ${innerHeight}`],
			[K('dpr'), `${num(dpr, 2)}×`],
			[K('depth'), bits(s.colorDepth)],
			[K('gamut'), gamut && { srgb: 'sRGB', p3: 'Display P3', rec2020: 'Rec. 2020' }[gamut]],
			[K('hdr'), flag('dynamic-range', 'high')],
			[K('orientation'), orient ? `${V(orient.split('-')[0])}${s.orientation.angle ? ` · ${s.orientation.angle}°` : ''}` : null],
			[K('refresh'), hz ? `≈ ${hz} Hz` : null],
			[K('extended'), 'isExtended' in s ? yn(s.isExtended) : null]
		],
		hardware: [
			[K('cpu'), nav.hardwareConcurrency ? String(nav.hardwareConcurrency) : null],
			[K('memory'), nav.deviceMemory ? `${nav.deviceMemory >= 8 ? '≥' : '≈'} ${num(nav.deviceMemory, 2)} GB` : null],
			[K('touch'), String(nav.maxTouchPoints ?? 0)],
			[K('pointer'), pointer && V(pointer)],
			[K('gpu'), gl?.renderer || null],
			/* Some engines name only themselves as the vendor */
			[K('gpuVendor'), gl?.vendor && !/^(Mozilla|WebKit)$/i.test(gl.vendor) && !gl.renderer.includes(gl.vendor) ? gl.vendor : null],
			[K('webgl'), gl ? `${gl.version} · ${t('bv.maxTexture', { px: num(gl.texture) })}` : V('no')],
			[K('webgpu'), !('gpu' in nav) ? V('no') : gpu ? gpu.text || V('noAdapter') : V('unknown')],
			[K('battery'), battery ? `${Desk.i18n.fmtNumber(battery.level, { style: 'percent' })}${battery.charging ? ` · ${V('charging')}` : ''}` : null]
		],
		network: [
			[K('online'), yn(nav.onLine)],
			[K('conn'), conn ? [conn.type, conn.effectiveType].filter(Boolean).join(' · ') || null : null],
			[K('downlink'), conn?.downlink ? `≈ ${num(conn.downlink, 1)} Mbit/s` : null],
			[K('rtt'), Number.isFinite(conn?.rtt) ? `≈ ${conn.rtt} ms` : null],
			[K('saveData'), conn ? yn(conn.saveData) : null]
		],
		locale: [
			[K('languages'), (nav.languages?.length ? nav.languages : [nav.language]).join(', ')],
			[K('intl'), ro.locale],
			[K('timezone'), `${ro.timeZone} (${utcOffset(-new Date().getTimezoneOffset())})`],
			[K('calendar'), ro.calendar],
			[K('numbering'), ro.numberingSystem],
			[K('sample'), `${new Intl.NumberFormat().format(1234567.89)} · ${new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(new Date())}`]
		],
		prefs: [
			[K('scheme'), V(media('prefers-color-scheme', ['dark', 'light']) || 'unknown')],
			[K('motion'), flag('prefers-reduced-motion', 'reduce')],
			[K('contrast'), contrast && V(contrast === 'no-preference' ? 'standard' : contrast)],
			[K('forced'), flag('forced-colors', 'active')],
			[K('transparency'), flag('prefers-reduced-transparency', 'reduce')]
		],
		privacy: [
			[K('cookies'), yn(nav.cookieEnabled)],
			[K('dnt'), nav.doNotTrack == null ? null : yn(nav.doNotTrack === '1')],
			[K('gpc'), 'globalPrivacyControl' in nav ? yn(nav.globalPrivacyControl) : null],
			[K('secure'), yn(isSecureContext)],
			[K('isolated'), yn(self.crossOriginIsolated === true)],
			[K('persisted'), yn(persisted)],
			[K('geo'), geo && V(geo)],
			[K('notify'), notify && V(notify)]
		],
		page: [
			[K('mode'), mode && V(mode)],
			[K('sw'), 'serviceWorker' in nav ? V(nav.serviceWorker.controller ? 'swOn' : 'swOff') : V('no')],
			[K('protocol'), nt?.nextHopProtocol ? proto[nt.nextHopProtocol] || nt.nextHopProtocol : null],
			[K('loaded'), nt?.loadEventEnd > 0 ? `${num(Math.round(nt.loadEventEnd))} ms` : null],
			[K('uptime'), t('uptime', { n: Math.round(performance.now() / 60000) })]
		]
	};
	const features = FEATURES.map(([label, test]) => {
		let ok = false;
		try {
			ok = !!test();
		} catch { /* treat as missing */ }
		return { label, ok };
	});
	return { rows, features };
}

/* ✓/✗ cells in as many columns as the window takes */
function features(io, list) {
	const cell = Math.max(...list.map(x => x.label.length)) + 4;
	const cols = Math.min(4, Math.max(1, Math.floor(io.cols() / cell)));
	for (let i = 0; i < list.length; i += cols) {
		const row = list.slice(i, i + cols);
		io.print(row.flatMap((x, j) => [
			Desk.h('span', { class: x.ok ? 'term-yes' : 'term-no', text: x.ok ? '  ✓ ' : '  ✗ ' }),
			Desk.h('span', { class: 'visually-hidden', text: `${V(x.ok ? 'yes' : 'no')}: ` }),
			j < row.length - 1 ? x.label.padEnd(cell - 4) : x.label
		]), 'term-pre');
	}
}

/* browser [section …] — what the browser reveals about itself, read locally */
async function browser(args, io) {
	const want = args.filter(a => !a.startsWith('-')).map(fold);
	if (want.some(w => !BI_SECTIONS.includes(w))) {
		io.err(t('biUsage', { list: BI_SECTIONS.join(' ') }));
		return;
	}
	const done = io.progress(t('gathering'));
	let facts;
	try {
		facts = await browserFacts();
	} finally {
		done();
	}
	const shown = want.length ? BI_SECTIONS.filter(id => want.includes(id)) : BI_SECTIONS;
	shown.forEach((id, i) => {
		if (i) io.blank();
		io.heading(t(`bs.${id}`));
		if (id === 'features') features(io, facts.features);
		else io.table(facts.rows[id].filter(r => r[1] != null && r[1] !== '').map(([k, v]) => [`  ${k}`, String(v)]), { wrap: true });
	});
	if (!want.length) {
		io.blank();
		io.dim(t('biLocal'));
	}
}

export default {
	browser: { help: '@terminal.cmd.browser', usage: '@terminal.usage.browser', man: '@terminal.man.browser', complete: () => BI_SECTIONS, run: browser }
};
