/* JPKCom Desktop — native panels (core part 'panels'): settings, wallpaper, backup, trash, about, help, install — © Jean Pierre Kolb — MIT License

   The panels are apps of kind 'native' (render(win) → Node, rebuilt on a
   language switch). Besides the windows this part owns:
     - the appearance preferences (theme, accent, dock size, magnification,
       desktop icons) and their pre-paint counterpart's job after boot,
     - the wallpaper layer (#wallpaper) and the motif registry (src/wallpapers/),
     - the trash store, the backup file format, the PWA registration.
   Services: settings, wallpaper, backup, trash, about, help, install
   (docs/packages/p03-panels.md lists their API, events and storage keys).

   The windows' code comes when one first opens (app field load: the files
   *-window.js, about.js, help.js; windowStyles) — what the boot and other
   modules need (preferences, row helpers, wallpaper layer, trash store,
   backup download, services) is imported here. */

import { hasIcon } from '../core/icons.js';
import { SETTINGS_KEYS, settingsService, initSettings } from './settings.js';
import { initWallpaper, wallpaperService, validateStored as validWallpaper } from './wallpaper.js';
import { initTrash, trashService, dockMenu as trashMenu, validateStored as validTrash, ICON_EMPTY, ICON_FULL } from './trash.js';
import { backupService } from './backup.js';
import { initInstall, installService, forgetOffline, offlinePossible } from './install.js';
import { config } from '../core/config.js';
import Desk from '../core/api.js';

/* "About this desktop" shows the brand glyph (default: the JPK monogram) */
const aboutIcon = config.brand.glyph && hasIcon(config.brand.glyph) ? config.brand.glyph : 'ti-info-circle';

export default {
	id: 'panels',
	kind: 'core',
	i18n: ['settings', 'wallpaper', 'backup', 'trash', 'about', 'help'],
	/* Every rule of these sheets is inside a panel window: they come with the first one */
	windowStyles: ['settings.css', 'wallpaper.css', 'panels.css'],

	apps: [
		{ id: 'about-desktop', kind: 'native', icon: aboutIcon, tint: 'slate', size: [360, 500], fixed: true, name: '@about.title', load: () => import('./about.js') },
		{ id: 'settings', kind: 'native', icon: 'ti-settings', tint: 'graphite', size: [720, 500], name: '@settings.title', load: () => import('./settings-window.js') },
		{ id: 'wallpaper', kind: 'native', icon: 'ti-wallpaper', tint: 'teal', size: [680, 620], name: '@wallpaper.appName', load: () => import('./wallpaper-window.js') },
		{ id: 'backup', kind: 'native', icon: 'ti-archive', tint: 'green', size: [480, 580], name: '@backup.appName', load: () => import('./backup-window.js') },
		{ id: 'trash', kind: 'native', icon: ICON_EMPTY, iconFull: ICON_FULL, tint: 'graphite', size: [520, 520], nodock: true, name: '@trash.title', load: () => import('./trash-window.js') },
		{ id: 'help', kind: 'native', icon: 'ti-help-circle', tint: 'graphite', size: [460, 480], name: '@help.appName', load: () => import('./help.js') }
	],

	storage: {
		...SETTINGS_KEYS,
		wallpaper: { type: 'json', reset: 'wallpaper', label: '@wallpaper.appName', validate: validWallpaper },
		trash: { type: 'json', reset: 'trash', label: '@trash.title', validate: validTrash, count: v => v.items.length }
	},

	/* The trash tile in the dock: open, then "Empty Trash …" (asks in the bin) — wins over the
	   shell's generic dock menu, as in the original */
	contextMenu: [{
		selector: '#dock .dock-item[data-app="trash"]',
		label: () => Desk.t('shell.menuOf', { name: Desk.apps.name(Desk.apps.get('trash')) || Desk.t('trash.title') }),
		items: trashMenu
	}],

	resetGroups: [
		{ id: 'wallpaper', label: '@wallpaper.appName', hint: '@wallpaper.resetHint', order: 20 },
		{ id: 'trash', label: '@trash.title', hint: '@trash.resetHint', order: 80 }
	],

	setup(desk) {
		initSettings();
		initWallpaper();
		initTrash();
		initInstall();
		/* Offline copies (service worker caches) — a group without keys, its own action */
		if (offlinePossible()) {
			desk.storage.registerGroup({ id: 'offline', label: '@settings.resetOffline', hint: '@settings.resetOfflineHint', order: 95, onReset: forgetOffline }, 'panels');
		}
		desk.provide('settings', settingsService);
		desk.provide('wallpaper', wallpaperService);
		desk.provide('backup', backupService);
		desk.provide('trash', trashService);
		desk.provide('about', Object.freeze({ open: () => Desk.launch('about-desktop') }));
		desk.provide('help', Object.freeze({ open: () => Desk.launch('help') }));
		desk.provide('install', installService);
	}
};
