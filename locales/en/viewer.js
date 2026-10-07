/* JPKCom Desktop — image viewer strings: English (reference locale) — © Jean Pierre Kolb — MIT License

   Namespace 'viewer': image windows (kind 'image') and the Image Viewer app
   (kind 'viewer'), its info bar. Download and Open in new tab come from 'core'. */
export default {
	appName: 'Image Viewer',
	appDesc: 'Shows pictures from this device',

	open: 'Open image …',
	openButton: 'Open image …',
	info: 'Info',
	none: 'No image open',
	dropHint: 'or drag an image here',
	/* Desktop drop hint: completes shell.dropSub ('Opens {list}') */
	dropLabel: 'images in the image viewer',
	error: '“{name}” cannot be shown as an image',
	tooBig: '“{name}” is larger than {max}',

	/* Info bar */
	name: 'Name',
	format: 'Format',
	formatVector: '{format} · vector graphic',
	dimensions: 'Dimensions',
	dimsPx: '{w} × {h} px',
	dimsUnits: '{w} × {h}',
	ratio: 'Aspect ratio',
	ratioValue: '{a}:{b}',
	resolution: 'Resolution',
	megapixels: '{n} MP',
	size: 'File size',
	bytes: { one: '{size} byte', other: '{size} bytes' },
	modified: 'Modified',
	source: 'Source',
	local: 'File from this device'
};
