/* JPKCom Desktop — Texte des Audio- und Videoplayers: Deutsch — © Jean Pierre Kolb — MIT License

   Namensraum 'media' (src/apps/media): die Apps Audioplayer und Videoplayer,
   ihre Wiedergabeliste, Bedienelemente, ihr Menü und die Infoleiste. */
export default {
	audioName: 'Audioplayer',
	audioDesc: 'Spielt Musik von diesem Gerät',
	videoName: 'Videoplayer',
	videoDesc: 'Spielt Videos von diesem Gerät',
	/* Desktop drop hint: completes shell.dropSub ('Opens {list}') */
	dropAudio: 'Audiodateien im Audioplayer',
	dropVideo: 'Videos im Videoplayer',

	/* Leeres Fenster */
	audioNone: 'Keine Musik geöffnet',
	videoNone: 'Kein Video geöffnet',
	openButton: 'Dateien öffnen …',
	dropHint: 'oder Dateien hierher ziehen — sie bleiben auf deinem Gerät',

	/* Knöpfe, Menü */
	open: 'Öffnen …',
	list: 'Wiedergabeliste',
	info: 'Informationen',
	clear: 'Liste leeren',
	remove: '„{name}“ entfernen',
	play: 'Wiedergabe',
	pause: 'Pause',
	prev: 'Vorheriger Titel',
	next: 'Nächster Titel',
	mute: 'Ton aus',
	unmute: 'Ton an',
	volume: 'Lautstärke',
	position: 'Position',
	positionValue: '{time} von {total}',
	remaining: '−{time}',
	repeatOff: 'Nicht wiederholen',
	repeatAll: 'Liste wiederholen',
	repeatOne: 'Titel wiederholen',
	fullscreen: 'Vollbild',
	cover: 'Cover von {name}',
	count: { one: '{n} Titel', other: '{n} Titel' },

	/* Meldungen */
	cantPlay: '„{name}“ kann dieser Browser nicht abspielen.',
	wrongKind: '„{name}“ gehört nicht in diesen Player.',
	full: { one: 'Die Liste ist voll (höchstens {n} Datei).', other: 'Die Liste ist voll (höchstens {n} Dateien).' },

	/* Infoleiste */
	name: 'Name',
	format: 'Format',
	duration: 'Dauer',
	resolution: 'Auflösung',
	resolutionValue: '{w} × {h} px',
	ratio: 'Seitenverhältnis',
	ratioValue: '{a}:{b}',
	title: 'Titel',
	artist: 'Interpret',
	album: 'Album',
	year: 'Jahr',
	track: 'Titelnummer',
	genre: 'Genre',
	rate: 'Datenrate',
	kbits: '≈ {n} kbit/s',
	mbits: '≈ {n} Mbit/s',
	size: 'Größe',
	bytes: { one: '{size} Byte', other: '{size} Bytes' },
	modified: 'Geändert',
	source: 'Quelle',
	local: 'Von diesem Gerät',
	unknown: '—'
};
