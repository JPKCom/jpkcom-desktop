/* JPKCom Desktop — media players: the player window (audio and video) — © Jean Pierre Kolb — MIT License

   player(kind) → the window hooks of the app 'audio' or 'video' (one
   implementation, two apps). Files come from the device (Open, Mod+O, dropped
   on the desktop or on the window) and play from blob URLs — nothing is
   uploaded and nothing is stored: the playlist lives as long as the window.

     audio  cover (from the tags) and names, own transport: seek bar with the
            elapsed and remaining time, previous / play / next, the repeat
            switches on the left, mute and volume on the right
     video  the browser's own controls; the repeat switches in the title bar

   Title bar: Open, (video: repeat track, repeat playlist,) Playlist, Info.
   The playlist (at most config.media.maxItems, default 200) opens by itself
   from the second file on unless it was toggled by hand; new files start at
   once unless something is playing — then they queue up. Tags and lengths
   are read one file after the other in the background. Repeat is two
   switches that exclude each other: "repeat track" always, "repeat playlist"
   from two files on (it switches itself off below that). The info bar (Mod+I)
   shows name, format, duration, (video: resolution, aspect ratio,) the tags,
   bit rate, size, date and source.

   Keys inside the window (not in fields, sliders, the video's own controls or
   the title bar): Space/K play-pause, ←/→ seek by config.media.seekStep
   seconds, M mute, N next, P previous, F full screen (video), Mod+O open,
   Mod+I info. The Media Session (system media keys, "now playing") belongs to
   whichever player played last. */

import Desk from '../../core/api.js';
import { ACCEPT, kindOf, stem, formatName } from './types.js';
import { readTags, TAG_BYTES } from './tags.js';
import { clock, ratioParts, bitRate, nextIndex, repeatAfter, mediaBlob, MEDIA_DEFAULTS } from './util.js';

const { h, t } = Desk;
const PROBE_MS = 5000;
const TAG_KEYS = ['title', 'artist', 'album', 'year', 'track', 'genre'];
const SESSION_ACTIONS = ['play', 'pause', 'previoustrack', 'nexttrack', 'seekbackward', 'seekforward', 'seekto'];

const num = (n, digits = 0) => Desk.i18n.fmtNumber(n, { maximumFractionDigits: digits });
const icon = id => Desk.icon(id);
const settings = () => Desk.modules.config('media') ?? MEDIA_DEFAULTS;
let seq = 0;

/* Length (and video size) of a file without playing it */
function probe(kind, url) {
	return new Promise(done => {
		const el = document.createElement(kind);
		el.preload = 'metadata';
		el.muted = true;
		const finish = value => {
			clearTimeout(timer);
			el.removeAttribute('src');
			el.load();
			done(value);
		};
		const timer = setTimeout(() => finish(null), PROBE_MS);
		el.addEventListener('loadedmetadata', () => finish({ duration: el.duration, width: el.videoWidth || 0, height: el.videoHeight || 0 }), { once: true });
		el.addEventListener('error', () => finish({ error: true }), { once: true });
		el.src = url;
	});
}

/* Media keys and the system's "now playing" belong to whichever player played last */
let sessionOwner = null;

function releaseSession(media) {
	if (sessionOwner !== media || typeof navigator === 'undefined' || !navigator.mediaSession) return;
	sessionOwner = null;
	try {
		navigator.mediaSession.metadata = null;
		for (const a of SESSION_ACTIONS) {
			try {
				navigator.mediaSession.setActionHandler(a, null);
			} catch { /* not supported here */ }
		}
	} catch { /* not supported */ }
}

/** The window hooks of one player app ('audio' | 'video') */
export function player(kind) {
	const audio = kind === 'audio';

	function mount(win, body, bar) {
		const st = { items: [], idx: -1, repeat: 'off', msg: null, listTouched: false, probing: false, seeking: false, closed: false };
		let uid = 0;
		const ids = `media-${kind}-${++seq}`;

		const media = h(kind, { preload: 'metadata', class: audio ? null : 'media-video' });
		if (!audio) {
			media.controls = true;
			media.playsInline = true;
		}
		const picker = h('input', { type: 'file', name: kind, accept: ACCEPT[kind], multiple: true, hidden: true, tabindex: '-1' });
		const btn = (glyph, run, extra = {}) => h('button', { type: 'button', class: 'win-btn', onclick: run, ...extra }, icon(glyph));

		/* Title bar: open, playlist, info */
		const list = h('aside', { class: 'media-list', id: `${ids}-list`, hidden: true });
		const info = h('aside', { class: 'media-info', id: `${ids}-info`, hidden: true });
		const openBtn = btn('ti-folder-open', () => picker.click());
		const listBtn = btn('ti-playlist', () => toggleList(), { 'aria-pressed': 'false', 'aria-controls': list.id });
		const infoBtn = btn('ti-info-circle', () => toggleInfo(), { 'aria-pressed': 'false', 'aria-controls': info.id });
		/* Repeat: two switches that exclude each other — the track always, the playlist from two files on.
		   Audio has them next to its controls, video (the browser's controls) in the title bar */
		const oneBtn = btn('ti-repeat-once', () => setRepeat('one'), { 'aria-pressed': 'false', class: 'win-btn media-repeat' });
		const allBtn = btn('ti-repeat', () => setRepeat('all'), { 'aria-pressed': 'false', class: 'win-btn media-repeat' });
		win.addActions(openBtn, audio ? null : [oneBtn, allBtn], listBtn, infoBtn);

		/* Empty state, as in the image viewer */
		const empty = h('div', { class: 'media-empty' });

		/* Audio: cover, names, own controls. Video: the browser's controls */
		const cover = h('div', { class: 'media-cover' });
		const nowTitle = h('h3', { class: 'media-title' });
		const nowSub = h('p', { class: 'media-sub' });
		const msg = h('p', { class: ['media-msg', 'is-empty'], role: 'status' });
		const seek = h('input', { type: 'range', class: 'media-range media-seek-range', name: `${kind}-position`, min: '0', max: '0', step: 'any', value: '0' });
		const timeNow = h('span', { class: 'media-time', text: clock(0) });
		const timeLeft = h('span', { class: 'media-time', text: clock(0) });
		const playBtn = h('button', { type: 'button', class: 'media-play', onclick: () => toggle() }, icon('tif-player-play'));
		const prevBtn = btn('ti-player-skip-back', () => prev());
		const nextBtn = btn('ti-player-skip-forward', () => next());
		const muteBtn = btn('ti-volume', () => { media.muted = !media.muted; });
		const vol = h('input', { type: 'range', class: 'media-range media-volume-range', name: `${kind}-volume`, min: '0', max: '1', step: '0.05', value: '1' });
		const transport = h('div', { class: 'media-transport' },
			h('div', { class: 'media-seek' }, timeNow, seek, timeLeft),
			h('div', { class: 'media-buttons' },
				h('div', { class: 'media-side' }, audio ? [oneBtn, allBtn] : null),
				h('div', { class: 'media-center' }, prevBtn, playBtn, nextBtn),
				h('div', { class: 'media-side media-vol' }, muteBtn, vol)));
		const stage = audio
			? h('div', { class: 'media-now' }, cover, h('div', { class: 'media-meta' }, nowTitle, nowSub))
			: h('div', { class: 'media-screen' }, media);
		const main = h('div', { class: ['media-main', `media-${kind}`] }, empty, stage, msg, audio ? transport : null, audio ? media : null);
		body.append(h('div', { class: 'media-box' }, main, list, info, picker));

		const current = () => st.items[st.idx] || null;
		const label = it => it.tags?.title || stem(it.name);
		const subline = it => [it.tags?.artist, it.tags?.album].filter(Boolean).join(' — ');
		const playing = () => !media.paused && !media.ended;
		const prevNextOff = () => !current() || nextIndex(st.idx, st.items.length, st.repeat) === null;
		const setLabel = (el, text) => {
			el.setAttribute('aria-label', text);
			el.title = text;
		};
		/* Messages are kept as key + params, so a language switch translates them too */
		const setMsg = (key, params) => { st.msg = key ? { key, params } : null; };

		function labels() {
			setLabel(openBtn, t('media.open'));
			setLabel(listBtn, t('media.list'));
			setLabel(infoBtn, t('media.info'));
			list.setAttribute('aria-label', t('media.list'));
			info.setAttribute('aria-label', t('media.info'));
			setLabel(prevBtn, t('media.prev'));
			setLabel(nextBtn, t('media.next'));
			seek.setAttribute('aria-label', t('media.position'));
			vol.setAttribute('aria-label', t('media.volume'));
			updatePlay();
			updateRepeat();
			updateVolume();
			updateTime();
		}

		/* ---------- Drawing ---------- */

		function render() {
			const it = current();
			win.setTitle(it ? label(it) : null);
			infoBtn.disabled = !it;
			empty.hidden = !!st.items.length;
			stage.hidden = !st.items.length;
			transport.hidden = !st.items.length;
			const note = st.msg ? t(st.msg.key, st.msg.params) : '';
			/* The live region stays in the DOM and is never `hidden` (some screen readers ignore a
			   region that appears together with its text); without files the empty view shows the
			   note and Desk.announce speaks it, so the region stays empty then */
			const spoken = st.items.length ? note : '';
			if (msg.textContent !== spoken) msg.textContent = spoken;
			msg.classList.toggle('is-empty', !spoken);
			if (!st.items.length) {
				/* The empty view covers the player: a message (wrong kind) shows inside it */
				/* Native replaceChildren() turns null into a "null" text node (and '' into an empty one): filter first */
				empty.replaceChildren(...[
					Desk.tile(win.app),
					h('p', { class: 'media-none', text: t(audio ? 'media.audioNone' : 'media.videoNone') }),
					note && h('p', { class: 'media-error', text: note }),
					h('button', { type: 'button', class: 'btn btn-primary', text: t('media.openButton'), onclick: () => picker.click() }),
					h('p', { class: 'media-hint', text: t('media.dropHint') })
				].filter(Boolean));
				if (!info.hidden) toggleInfo(false);
			}
			if (audio) {
				nowTitle.textContent = it ? label(it) : '';
				nowSub.textContent = it ? subline(it) : '';
				nowSub.hidden = !nowSub.textContent;
				cover.replaceChildren(it?.cover
					? h('img', { src: it.cover, alt: t('media.cover', { name: it.tags?.album || label(it) }) })
					: Desk.tile(win.app));
			}
			updateRepeat();
			prevBtn.disabled = !it;
			nextBtn.disabled = prevNextOff();
			updatePlay();
			renderList();
			renderInfo();
		}

		function updatePlay() {
			const on = playing();
			playBtn.replaceChildren(icon(on ? 'tif-player-pause' : 'tif-player-play'));
			setLabel(playBtn, t(on ? 'media.pause' : 'media.play'));
			playBtn.disabled = !current();
			const cur = list.querySelector('.is-current .media-num');
			if (cur) cur.replaceChildren(icon(on ? 'ti-volume' : 'ti-player-pause'));
		}

		function updateRepeat() {
			/* "Repeat playlist" means nothing with a single file — it goes away and switches off */
			if (st.repeat === 'all' && st.items.length < 2) st.repeat = 'off';
			for (const [b, mode, key] of [[oneBtn, 'one', 'media.repeatOne'], [allBtn, 'all', 'media.repeatAll']]) {
				b.setAttribute('aria-pressed', String(st.repeat === mode));
				setLabel(b, t(key));
			}
			oneBtn.disabled = !current();
			allBtn.hidden = st.items.length < 2;
		}

		function updateVolume() {
			const off = media.muted || media.volume === 0;
			muteBtn.replaceChildren(icon(off ? 'ti-volume-3' : 'ti-volume'));
			setLabel(muteBtn, t(media.muted ? 'media.unmute' : 'media.mute'));
			const level = media.muted ? 0 : media.volume;
			vol.value = String(level);
			vol.setAttribute('aria-valuetext', Desk.i18n.fmtNumber(level, { style: 'percent', maximumFractionDigits: 0 }));
		}

		function updateTime() {
			const d = media.duration;
			const tm = media.currentTime || 0;
			if (!st.seeking) {
				seek.max = String(Number.isFinite(d) ? d : 0);
				seek.value = String(tm);
			}
			timeNow.textContent = clock(tm);
			timeLeft.textContent = Number.isFinite(d) ? t('media.remaining', { time: clock(Math.max(0, d - tm)) }) : clock(NaN);
			seek.setAttribute('aria-valuetext', t('media.positionValue', { time: clock(tm), total: clock(d) }));
		}

		function renderList() {
			const focused = list.contains(document.activeElement) ? document.activeElement.dataset.key : null;
			const on = playing();
			list.replaceChildren(
				h('div', { class: 'media-list-head' },
					h('h3', { text: t('media.list') }),
					h('span', { class: 'media-count', text: t('media.count', { n: st.items.length }) })),
				h('ol', {}, st.items.map((it, i) => {
					const here = i === st.idx;
					const name = label(it);
					const sub = subline(it);
					return h('li', { class: [here && 'is-current', it.error && 'is-error'] },
						h('button', {
							type: 'button', class: 'media-item', dataset: { key: `i${it.id}` }, 'aria-current': here ? 'true' : null,
							onclick: () => load(i, true)
						},
						h('span', { class: 'media-num', 'aria-hidden': 'true' }, here ? icon(on ? 'ti-volume' : 'ti-player-pause') : String(i + 1)),
						h('span', { class: 'media-name' }, h('span', { text: name }), sub ? h('small', { text: sub }) : null),
						h('span', { class: 'media-dur', text: it.duration != null ? clock(it.duration) : '' })),
						h('button', {
							type: 'button', class: 'win-btn media-remove', dataset: { key: `r${it.id}` },
							'aria-label': t('media.remove', { name }), title: t('media.remove', { name }), onclick: () => remove(i)
						}, icon('ti-x')));
				})));
			if (focused) list.querySelector(`[data-key="${Desk.dom.cssEscape(focused)}"]`)?.focus({ preventScroll: true });
		}

		function renderInfo() {
			const it = current();
			if (!it || info.hidden) return;
			const mine = media.src === it.url;
			const d = Number.isFinite(media.duration) && mine ? media.duration : it.duration;
			const w = mine && media.videoWidth ? media.videoWidth : it.width;
			const hgt = mine && media.videoHeight ? media.videoHeight : it.height;
			const rate = bitRate(it.file.size, d);
			const ratio = ratioParts(w, hgt);
			const tags = it.tags || {};
			const none = t('media.unknown');
			const rows = [
				[t('media.name'), it.name],
				[t('media.format'), formatName(it.name, it.file.type) || none, it.file.type || null],
				[t('media.duration'), Number.isFinite(d) ? clock(d) : none],
				...(!audio && w && hgt ? [
					[t('media.resolution'), t('media.resolutionValue', { w: num(w), h: num(hgt) })],
					[t('media.ratio'), ratio
						? t('media.ratioValue', { a: String(ratio.a), b: String(ratio.b) })
						: t('media.ratioValue', { a: num(w / hgt, 2), b: '1' })]
				] : []),
				...TAG_KEYS.filter(k => tags[k]).map(k => [t(`media.${k}`), tags[k]]),
				...(rate ? [[t('media.rate'), rate >= 1000 ? t('media.mbits', { n: num(rate / 1000, 1) }) : t('media.kbits', { n: num(rate) })]] : []),
				[t('media.size'), Desk.i18n.fmtBytes(it.file.size), it.file.size >= 1024 ? t('media.bytes', { n: it.file.size, size: num(it.file.size) }) : null],
				...(it.file.lastModified ? [[t('media.modified'), Desk.i18n.fmtDate(it.file.lastModified, { dateStyle: 'medium', timeStyle: 'short' })]] : []),
				[t('media.source'), t('media.local')]
			];
			info.replaceChildren(
				h('h3', { text: t('media.info') }),
				h('dl', {}, rows.map(([k, v, sub]) => [h('dt', { text: k }), h('dd', {}, v, sub ? h('small', { text: sub }) : null)])));
		}

		/* ---------- Playlist ---------- */

		function add(input) {
			const files = [...(input || [])].filter(f => f && typeof f.name === 'string');
			if (!files.length || st.closed) return 0;
			const max = settings().maxItems;
			const wrong = files.filter(f => kindOf(f) !== kind);
			const ok = files.filter(f => kindOf(f) === kind);
			const room = Math.max(0, max - st.items.length);
			const first = st.items.length;
			for (const file of ok.slice(0, room)) {
				st.items.push({
					id: ++uid, file, name: file.name, url: URL.createObjectURL(mediaBlob(file, kind)),
					duration: null, width: 0, height: 0, tags: null, cover: null, coverType: null, done: false, error: false
				});
			}
			if (ok.length > room) setMsg('media.full', { n: max });
			else if (wrong.length) setMsg('media.wrongKind', { name: wrong[0].name });
			else setMsg(null);
			/* With files, .media-msg (role=status) speaks the message; the empty view's line is no live region */
			if (st.msg && !st.items.length) Desk.announce(t(st.msg.key, st.msg.params));
			if (st.items.length > 1 && !st.listTouched && list.hidden) toggleList(true, false);
			/* New files start right away — unless something is playing: then they queue up.
			   The message about refused files stays visible (the original lost it here) */
			if (st.items.length > first && (media.paused || media.ended)) load(first, true, true);
			else render();
			scan();
			return st.items.length - first;
		}

		function load(i, start, keepMsg = false) {
			const it = st.items[i];
			if (!it) return;
			st.idx = i;
			if (!keepMsg) setMsg(null);
			it.error = false;
			media.src = it.url;
			render();
			updateTime();
			if (start) media.play().catch(() => updatePlay());
		}

		function release(it) {
			URL.revokeObjectURL(it.url);
			if (it.cover) URL.revokeObjectURL(it.cover);
		}

		function stop() {
			media.pause();
			media.removeAttribute('src');
			media.load();
		}

		function remove(i) {
			const it = st.items[i];
			if (!it) return;
			const wasCurrent = i === st.idx;
			release(it);
			st.items.splice(i, 1);
			if (i < st.idx) st.idx--;
			if (wasCurrent) {
				stop();
				st.idx = -1;
				if (st.items.length) load(Math.min(i, st.items.length - 1), false);
			}
			if (!st.items.length) st.idx = -1;
			render();
			/* Keep the keyboard in the list: the next entry, else the open button */
			const nextItem = st.items[Math.min(i, st.items.length - 1)];
			(nextItem ? list.querySelector(`[data-key="i${nextItem.id}"]`) : openBtn)?.focus({ preventScroll: true });
		}

		function clear() {
			stop();
			for (const it of st.items) release(it);
			st.items = [];
			st.idx = -1;
			setMsg(null);
			render();
		}

		/* Tags and lengths of the whole list, one file after the other */
		async function scan() {
			if (st.probing) return;
			st.probing = true;
			try {
				for (let it; (it = st.items.find(x => !x.done));) {
					it.done = true;
					if (audio) {
						const tags = await readTags(it.file, TAG_BYTES);
						if (st.closed) return;
						if (tags?.cover && st.items.includes(it)) {
							it.cover = URL.createObjectURL(new Blob([tags.cover.bytes], { type: tags.cover.type }));
							it.coverType = tags.cover.type;
						}
						if (tags) delete tags.cover;
						it.tags = tags;
					}
					if (it.duration == null && st.items.includes(it)) {
						const p = await probe(kind, it.url);
						if (p && !p.error && it.duration == null) Object.assign(it, { duration: p.duration, width: p.width, height: p.height });
					}
					if (st.closed || !win.el.isConnected) return;
					if (it === current()) {
						render();
						if (playing()) nowPlaying();
					} else {
						renderList();
					}
				}
			} finally {
				st.probing = false;
			}
		}

		/* ---------- Playing ---------- */

		function toggle() {
			if (!current()) return;
			if (media.paused || media.ended) media.play().catch(() => updatePlay());
			else media.pause();
		}

		function prev() {
			if (!current()) return;
			/* As in every player: a few seconds in, "back" means the start of this track */
			if (media.currentTime > 3 || st.idx === 0) media.currentTime = 0;
			else load(st.idx - 1, !media.paused);
		}

		function next(auto) {
			if (!current()) return;
			const i = nextIndex(st.idx, st.items.length, st.repeat);
			if (i !== null) load(i, auto || !media.paused);
		}

		/* A switch turns its mode on, or off again; the menu sets a mode directly */
		function setRepeat(mode, direct = false) {
			st.repeat = repeatAfter(st.repeat, mode, { direct, count: st.items.length });
			render();
		}

		function skip(sec) {
			if (!current() || !Number.isFinite(media.duration)) return;
			media.currentTime = Math.min(media.duration, Math.max(0, media.currentTime + sec));
		}

		function fullscreen() {
			if (!audio && current()) media.requestFullscreen?.().catch(() => {});
		}

		function nowPlaying() {
			const ms = typeof navigator !== 'undefined' ? navigator.mediaSession : null;
			const it = current();
			if (!ms || !it) return;
			sessionOwner = media;
			try {
				ms.metadata = new MediaMetadata({
					title: label(it), artist: it.tags?.artist || '', album: it.tags?.album || '',
					artwork: it.cover ? [{ src: it.cover, type: it.coverType || undefined }] : []
				});
			} catch { /* MediaMetadata missing */ }
			const set = (action, fn) => {
				try {
					ms.setActionHandler(action, fn);
				} catch { /* not supported here */ }
			};
			set('play', () => media.play().catch(() => updatePlay()));
			set('pause', () => media.pause());
			set('previoustrack', prev);
			set('nexttrack', () => next());
			set('seekbackward', e => skip(-(e?.seekOffset || 10)));
			set('seekforward', e => skip(e?.seekOffset || 10));
			set('seekto', e => {
				if (Number.isFinite(e?.seekTime)) media.currentTime = e.seekTime;
			});
		}

		media.addEventListener('play', () => {
			nowPlaying();
			updatePlay();
		});
		media.addEventListener('pause', updatePlay);
		media.addEventListener('timeupdate', updateTime);
		media.addEventListener('volumechange', updateVolume);
		media.addEventListener('loadedmetadata', () => {
			const it = current();
			if (it) Object.assign(it, { duration: media.duration, width: media.videoWidth || 0, height: media.videoHeight || 0 });
			updateTime();
			renderList();
			renderInfo();
		});
		media.addEventListener('ended', () => {
			if (st.repeat === 'one') {
				media.currentTime = 0;
				media.play().catch(() => updatePlay());
			} else {
				next(true);
				updatePlay();
			}
		});
		media.addEventListener('error', () => {
			const it = current();
			if (!it || !media.getAttribute('src')) return;
			it.error = true;
			setMsg('media.cantPlay', { name: it.name });
			/* Spoken once, by the .media-msg live region (role=status) that render() fills */
			render();
		});

		seek.addEventListener('input', () => {
			st.seeking = true;
			media.currentTime = Number(seek.value);
			updateTime();
		});
		seek.addEventListener('change', () => { st.seeking = false; });
		vol.addEventListener('input', () => {
			media.volume = Number(vol.value);
			media.muted = media.volume === 0;
		});

		/* ---------- Panels, keys ---------- */

		function toggleList(on = list.hidden, byHand = true) {
			if (byHand) st.listTouched = true;
			list.hidden = !on;
			listBtn.setAttribute('aria-pressed', String(on));
		}

		function toggleInfo(on = info.hidden) {
			if (on && !current()) return;
			info.hidden = !on;
			infoBtn.setAttribute('aria-pressed', String(on));
			if (on) renderInfo();
		}

		picker.addEventListener('change', () => {
			const files = [...(picker.files || [])];
			picker.value = '';
			if (files.length) add(files);
		});

		win.el.addEventListener('keydown', e => {
			if (e.altKey || e.isComposing || e.defaultPrevented) return;
			const k = e.key.toLowerCase();
			if (e.ctrlKey || e.metaKey) {
				if (e.shiftKey) return;
				if (k === 'o') {
					e.preventDefault();
					picker.click();
				} else if (k === 'i') {
					e.preventDefault();
					toggleInfo();
				}
				return;
			}
			/* Fields, sliders, the video's own controls and buttons (Space, Enter) handle their keys themselves */
			if (e.target.closest('input, select, textarea, video, .win-bar, .sheet')) return;
			if ((k === ' ' || k === 'enter') && e.target.closest('button')) return;
			if (k === ' ' || k === 'k') toggle();
			else if (k === 'arrowleft') skip(-settings().seekStep);
			else if (k === 'arrowright') skip(settings().seekStep);
			else if (k === 'm') media.muted = !media.muted;
			else if (k === 'n') next();
			else if (k === 'p') prev();
			else if (k === 'f' && !audio && current()) fullscreen();
			else return;
			e.preventDefault();
		});

		/* Without the shell's drop handling, the window still takes dropped files */
		const hasFiles = e => [...(e.dataTransfer?.types || [])].includes('Files');
		body.addEventListener('dragover', e => {
			if (Desk.service('drop') || !hasFiles(e)) return;
			e.preventDefault();
			e.dataTransfer.dropEffect = 'copy';
		});
		body.addEventListener('drop', e => {
			if (Desk.service('drop') || !hasFiles(e)) return;
			e.preventDefault();
			add([...(e.dataTransfer.files || [])]);
		});

		win.state.media = {
			add, labels, render, clear,
			focusFirst() {
				(current() ? (audio ? playBtn : media) : empty.querySelector('.btn'))?.focus({ preventScroll: true });
			},
			menu: () => [
				{ label: t('media.open'), shortcut: 'Mod+O', run: () => picker.click() },
				'-',
				{ label: t(playing() ? 'media.pause' : 'media.play'), disabled: !current(), run: toggle },
				{ label: t('media.prev'), disabled: !current(), run: prev },
				{ label: t('media.next'), disabled: prevNextOff(), run: () => next() },
				...(audio ? [] : [{ label: t('media.fullscreen'), disabled: !current(), run: fullscreen }]),
				'-',
				...['off', 'all', 'one'].map(r => ({
					label: t({ off: 'media.repeatOff', all: 'media.repeatAll', one: 'media.repeatOne' }[r]), radio: true, checked: st.repeat === r,
					disabled: !current() || (r === 'all' && st.items.length < 2), run: () => setRepeat(r, true)
				})),
				'-',
				{ label: t('media.list'), checkbox: true, checked: !list.hidden, run: () => toggleList() },
				{ label: t('media.info'), checkbox: true, checked: !info.hidden, disabled: !current(), shortcut: 'Mod+I', run: () => toggleInfo() },
				{ label: t('media.clear'), disabled: !st.items.length, run: clear }
			],
			unmount() {
				st.closed = true;
				clear();
				releaseSession(media);
			},
			/* For tests and other code: what the window holds now */
			snapshot: () => ({
				kind, count: st.items.length, index: st.idx, repeat: st.repeat, playing: playing(),
				list: !list.hidden, info: !info.hidden, message: st.msg ? t(st.msg.key, st.msg.params) : null,
				items: st.items.map(it => ({ name: it.name, title: label(it), sub: subline(it), duration: it.duration, error: it.error, cover: !!it.cover }))
			})
		};

		labels();
		render();
	}

	return {
		mount,
		focus: win => win.state.media?.focusFirst(),
		relabel(win) {
			win.state.media?.labels();
			win.state.media?.render();
		},
		menu: win => win.state.media?.menu() ?? [],
		unmount: win => win.state.media?.unmount(),
		/* Defence in depth: never "Open in new tab" — a file from the device must not become a document */
		canPopOut: () => false,
		/* Every item comes from the device: a link (#app=audio) would only reopen an empty player */
		canLink: win => !(win.state.media?.snapshot().count > 0)
	};
}
