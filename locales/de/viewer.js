/* JPKCom Desktop — image viewer strings: German — © Jean Pierre Kolb — MIT License

   Namespace 'viewer': Bildfenster (Art 'image') und die App Bildbetrachter
   (Art 'viewer') mit ihrer Info-Leiste. Herunterladen und In neuem Tab öffnen kommen aus 'core'. */
export default {
	appName: 'Bildbetrachter',
	appDesc: 'Zeigt Bilder von diesem Gerät',

	open: 'Bild öffnen …',
	openButton: 'Bild öffnen …',
	info: 'Informationen',
	none: 'Kein Bild geöffnet',
	dropHint: 'oder ein Bild hierher ziehen',
	/* Desktop drop hint: completes shell.dropSub ('Opens {list}') */
	dropLabel: 'Bilder im Bildbetrachter',
	error: '„{name}“ lässt sich nicht als Bild anzeigen',
	tooBig: '„{name}“ ist größer als {max}',

	/* Info-Leiste */
	name: 'Name',
	format: 'Format',
	formatVector: '{format} · Vektorgrafik',
	dimensions: 'Maße',
	dimsPx: '{w} × {h} px',
	dimsUnits: '{w} × {h}',
	ratio: 'Seitenverhältnis',
	ratioValue: '{a}:{b}',
	resolution: 'Auflösung',
	megapixels: '{n} MP',
	size: 'Dateigröße',
	bytes: { one: '{size} Byte', other: '{size} Bytes' },
	modified: 'Geändert',
	source: 'Quelle',
	local: 'Datei von diesem Gerät'
};
