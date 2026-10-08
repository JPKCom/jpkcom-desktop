/* JPKCom Desktop — backup: the desktop's settings and data as one JSON file — © Jean Pierre Kolb — MIT License

   What goes into a backup is not a hand-kept list: every module declares its
   stored keys in its descriptor (storage: { name: { backup, reset, validate,
   count, label } }) and the storage registry builds the document
   ({ format: config.backup.format, version, created, data }). On import every
   value is validated again by the key's own validator; keys this desktop does
   not know are left out. Restoring closes the windows (they write what they
   still hold), writes the values and restarts the desktop.

   Service 'backup': download(), snapshot(), open().

   The window (summary, import preview, restore) is backup-window.js, loaded
   when it first opens; the download stays here (the service, the reset
   section of the settings). */

import Desk from '../core/api.js';
import { dateStamp } from './pure.js';

const { t, storage } = Desk;
/* Validated by the core (validateConfig): an invalid site value is warned about and
   replaced by the default — no second default kept here */
const PREFIX = Desk.config.backup.filePrefix;

/** Writes the backup file */
export function download() {
	const doc = storage.snapshot();
	Desk.dom.saveFile(JSON.stringify(doc, null, '\t'), `${PREFIX}-${dateStamp()}.json`, 'application/json');
	Desk.announce(t('backup.downloaded'));
}

export const backupService = Object.freeze({
	download,
	snapshot: () => storage.snapshot(),
	open: () => Desk.launch('backup')
});
