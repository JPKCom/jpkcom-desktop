/* JPKCom Desktop — window manager (core part 'wm') — © Jean Pierre Kolb — MIT License

   The descriptor of the window manager: strings ('wm' namespace), styles,
   and the service 'wm' (src/wm/wm.js — the kinds 'web', 'app' and 'native'
   are built in). The extras hook into wm.js through addDragHandler(),
   addDecorator(), the 'window:*' bus events and the geometry helpers
   (docs/ARCHITECTURE.md → "WM API"):

     snap.js      drag to an edge: half or zoom, with a preview   service 'snap'
     tilemenu.js  arrange menu on the zoom button (hover / long press)
     overview.js  every window side by side                       service 'overview'
     session.js   the windows come back on the next visit         service 'session'

   An extra that fails to start is reported and left out — windows keep working. */

import { initWM, wm } from './wm.js';
import { initSnap } from './snap.js';
import { initTileMenu } from './tilemenu.js';
import { initOverview } from './overview.js';
import { initSession, storageKeys } from './session.js';

function extra(name, start) {
	try {
		return start();
	} catch (err) {
		console.error(`[wm] ${name} could not start:`, err);
		return null;
	}
}

export default {
	id: 'wm',
	kind: 'core',
	i18n: ['wm'],
	styles: ['wm.css', 'extras.css'],

	/* 'session': the open windows (device-bound); 'restore': the user's switch (settings) */
	storage: storageKeys,

	setup(desk) {
		initWM();
		desk.provide('wm', wm);

		const snap = extra('snap', initSnap);
		if (snap) desk.provide('snap', snap);
		extra('tile menu', initTileMenu);
		const overview = extra('overview', initOverview);
		if (overview) desk.provide('overview', overview);
		/* Registers its 'desk:ready' listener here, so it runs before the shell's (deep links) */
		const session = extra('session', initSession);
		if (session) desk.provide('session', session);
	}
};
