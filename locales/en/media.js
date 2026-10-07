/* JPKCom Desktop — audio and video player strings: English (reference locale) — © Jean Pierre Kolb — MIT License

   Namespace 'media' (src/apps/media): the apps Audio Player and Video Player,
   their playlist, controls, menu and info bar. */
export default {
	audioName: 'Audio Player',
	audioDesc: 'Plays music from this device',
	videoName: 'Video Player',
	videoDesc: 'Plays videos from this device',
	/* Desktop drop hint: completes shell.dropSub ('Opens {list}') */
	dropAudio: 'audio files in the audio player',
	dropVideo: 'videos in the video player',

	/* Empty window */
	audioNone: 'No music open',
	videoNone: 'No video open',
	openButton: 'Open files …',
	dropHint: 'or drag files here — they stay on your device',

	/* Buttons, menu */
	open: 'Open …',
	list: 'Playlist',
	info: 'Info',
	clear: 'Clear playlist',
	remove: 'Remove “{name}”',
	play: 'Play',
	pause: 'Pause',
	prev: 'Previous track',
	next: 'Next track',
	mute: 'Mute',
	unmute: 'Unmute',
	volume: 'Volume',
	position: 'Position',
	positionValue: '{time} of {total}',
	remaining: '−{time}',
	repeatOff: 'Don’t repeat',
	repeatAll: 'Repeat playlist',
	repeatOne: 'Repeat track',
	fullscreen: 'Full screen',
	cover: 'Cover of {name}',
	count: { one: '{n} track', other: '{n} tracks' },

	/* Messages */
	cantPlay: 'This browser cannot play “{name}”.',
	wrongKind: '“{name}” does not belong in this player.',
	full: { one: 'The playlist is full ({n} file at most).', other: 'The playlist is full ({n} files at most).' },

	/* Info bar */
	name: 'Name',
	format: 'Format',
	duration: 'Duration',
	resolution: 'Resolution',
	resolutionValue: '{w} × {h} px',
	ratio: 'Aspect ratio',
	ratioValue: '{a}:{b}',
	title: 'Title',
	artist: 'Artist',
	album: 'Album',
	year: 'Year',
	track: 'Track',
	genre: 'Genre',
	rate: 'Bit rate',
	kbits: '≈ {n} kbit/s',
	mbits: '≈ {n} Mbit/s',
	size: 'Size',
	bytes: { one: '{size} byte', other: '{size} bytes' },
	modified: 'Modified',
	source: 'Source',
	local: 'From this device',
	unknown: '—'
};
