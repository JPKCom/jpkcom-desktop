/* JPKCom Desktop — Calculator app: point before line, percent, history, keyboard — © Jean Pierre Kolb — MIT License

   A basic calculator. The arithmetic lives in engine.js (pure, no eval), the
   keypad and the keyboard in window.js; the last calculations are kept in
   storage key 'calc' ({ history: [{ e, r }] }, checked by history.js).

   This file is the descriptor; the window is window.js, loaded when it first
   opens (app field load, windowStyles) together with engine.js. */

import Desk from '../../core/api.js';
import { HISTORY, cleanCalc } from './history.js';

const { store } = Desk;
export const KEY = 'calc';

/* config.calc.historySize (optional section; the default keeps 50) */
const cfg = () => Desk.modules.config('calc') ?? {};
export const historySize = () => cfg().historySize ?? HISTORY;

export const load = () => store.getJson(KEY, v => cleanCalc(v, historySize()), null) ?? { history: [] };

export default {
	id: 'calc',
	kind: 'app',
	i18n: ['calc'],
	windowStyles: ['calc.css'],

	app: {
		icon: 'ti-calculator', tint: 'black', size: [300, 470], fixed: true, name: '@calc.appName', desc: '@calc.appDesc',
		load: () => import('./window.js')
	},

	storage: {
		calc: { type: 'json', backup: true, reset: 'calc', label: '@calc.historyLabel',
			validate: v => cleanCalc(v, historySize()), count: v => v.history.length }
	},
	resetGroups: [{ id: 'calc', label: '@calc.historyLabel', hint: '@calc.resetHint', order: 55 }],

	/* Optional config section calc: { historySize } */
	configKey: 'calc',
	validateConfig(section, warn) {
		const out = {};
		if (section && typeof section === 'object' && section.historySize !== undefined) {
			if (Number.isInteger(section.historySize) && section.historySize >= 0 && section.historySize <= 500) out.historySize = section.historySize;
			else warn(`historySize must be an integer 0–500 — using ${HISTORY}`);
		}
		return out;
	}
};
