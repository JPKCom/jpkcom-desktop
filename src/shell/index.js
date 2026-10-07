/* JPKCom Desktop — shell (core part 'shell'): menu bar, dock, launcher, desktop, shortcuts — © Jean Pierre Kolb — MIT License

   The descriptor of the shell. Its parts and the services they provide
   (docs/ARCHITECTURE.md → "Services", docs/packages/p02-shell.md):

     menus.js          menu engine                                   'menus'
     menubar.js        brand, app, site, Window, Help menus; status  'menubar'
     clock.js          clock in the menu bar (opens the calendar)    'clock'
     lang.js           language toggle (2) or menu (3+)              'langmenu'
     menubar-fit.js    crowded menu bar: app name, then the date give way
     title-fit.js      title bars: centred titles, "More actions"
     dock.js           the dock                                      'dock'
     desktop-icons.js  icons on the desktop                          'desktop'
     launcher.js       All apps                                      'launcher'
     shortcuts.js      keyboard shortcuts, also in iframes           'shortcuts'
     context-menu.js   right-click, long press, ContextMenu key      'contextmenu'
     notifications.js  banners                                       'notifications'
     deeplinks.js      #/path, #app=, #search= and the history       'deeplinks'
     drop.js           files dropped onto the desktop                'drop'
     power.js          boot screen, restart, shut down               'power'

   Every part starts on its own: one that fails is reported and left out,
   the others keep working. */

import { on } from '../core/bus.js';
import { initMenus, menus } from './menus.js';
import { initMenubar, addStatus } from './menubar.js';
import { initClock, SECONDS_KEY } from './clock.js';
import { initLang } from './lang.js';
import { initMenubarFit } from './menubar-fit.js';
import { initTitleFit } from './title-fit.js';
import { initDock, reset as resetDock, PINS_KEY, SIZE_KEY, MAGNIFY_KEY, SIZES, cleanPins } from './dock.js';
import { initDesktopIcons, ICONS_KEY } from './desktop-icons.js';
import { initLauncher } from './launcher.js';
import { initShortcuts } from './shortcuts.js';
import { initContextMenu } from './context-menu.js';
import { initNotifications } from './notifications.js';
import { initDeeplinks } from './deeplinks.js';
import { initDrop } from './drop.js';
import { initPower } from './power.js';

function part(name, start) {
	try {
		return start() ?? null;
	} catch (err) {
		console.error(`[shell] ${name} could not start:`, err);
		return null;
	}
}

export default {
	id: 'shell',
	kind: 'core',
	i18n: ['shell', 'wm'],
	styles: ['menus.css', 'menubar.css', 'desktop-icons.css', 'dock.css', 'launcher.css', 'notifications.css', 'drop.css', 'power.css'],

	/* "All apps": the first dock item; it opens while the launcher service exists */
	apps: [{
		id: 'launcher', kind: 'launcher', icon: 'ti-layout-grid', tint: 'graphite', dock: true,
		name: '@shell.allApps', desc: '@shell.allAppsDesc'
	}],

	storage: {
		[PINS_KEY]: { type: 'json', backup: true, reset: 'dock', label: '@shell.storeDock', validate: v => cleanPins(v, 500), count: v => v.length },
		[SIZE_KEY]: { type: 'text', backup: true, reset: 'settings', label: '@shell.storeDockSize', validate: v => (SIZES.includes(v) ? v : null) },
		[MAGNIFY_KEY]: { type: 'text', backup: true, reset: 'settings', label: '@shell.storeMagnify', validate: v => (v === 'on' || v === 'off' ? v : null) },
		[ICONS_KEY]: { type: 'text', backup: true, reset: 'settings', label: '@shell.storeIcons', validate: v => (v === 'shown' || v === 'hidden' ? v : null) },
		[SECONDS_KEY]: { type: 'text', backup: true, reset: 'settings', label: '@shell.storeSeconds', validate: v => (v === 'on' || v === 'off' ? v : null) }
	},
	resetGroups: [
		{ id: 'dock', label: '@shell.resetDock', hint: '@shell.resetDockHint', order: 30, onReset: () => resetDock() }
	],

	setup(desk) {
		initMenus();
		desk.provide('menus', menus);

		const provide = (name, impl) => { if (impl) desk.provide(name, impl); };

		/* Shortcuts first: the web window kind hands its frames to it */
		provide('shortcuts', part('shortcuts', initShortcuts));
		provide('menubar', part('menu bar', initMenubar));
		provide('langmenu', part('language switch', () => initLang(addStatus)));
		provide('clock', part('clock', () => initClock(addStatus)));
		part('menu bar fit', initMenubarFit);
		part('title fit', initTitleFit);
		provide('notifications', part('notifications', initNotifications));
		provide('launcher', part('launcher', initLauncher));
		provide('dock', part('dock', initDock));
		provide('desktop', part('desktop icons', initDesktopIcons));
		provide('contextmenu', part('context menu', initContextMenu));
		const links = part('deep links', initDeeplinks);
		provide('deeplinks', links);
		provide('drop', part('drop', initDrop));
		const power = part('power', initPower);
		provide('power', power);

		/* After the session restore (the wm's listener runs first): links in the address, then the boot screen goes */
		on('desk:ready', () => {
			part('deep links start', () => links?.start());
			part('boot screen', () => power?.boot());
		});
	}
};
