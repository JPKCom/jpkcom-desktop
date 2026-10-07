/* JPKCom Desktop — tests: public holidays (Easter, region rules, weekday rules, the de-by example) — © Jean Pierre Kolb — MIT License */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { easter, cleanRegion, holidaysOf, byDay, dayKey, nthWeekday } from '../src/modules/holidays/core.js';
import deBy from '../src/modules/holidays/regions/de-by.js';

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

test('Easter Sunday (Meeus/Jones/Butcher)', () => {
	const known = { 1818: '1818-03-22', 2000: '2000-04-23', 2019: '2019-04-21', 2024: '2024-03-31', 2025: '2025-04-20', 2026: '2026-04-05', 2038: '2038-04-25' };
	for (const [y, date] of Object.entries(known)) assert.equal(iso(easter(Number(y))), date, `Easter ${y}`);
});

test('nthWeekday: nth from the start or from the end, with from/to', () => {
	assert.equal(iso(nthWeekday(2026, 10, 4, 4)), '2026-11-26');           // 4th Thursday of November
	assert.equal(iso(nthWeekday(2026, 4, 1, -1)), '2026-05-25');           // last Monday of May
	assert.equal(iso(nthWeekday(2026, 10, 3, 1, { from: 16 })), '2026-11-18'); // Wednesday before 23 November
	assert.equal(iso(nthWeekday(2026, 10, 3, -1, { to: 22 })), '2026-11-18');
	assert.equal(nthWeekday(2026, 1, 1, 5), null);                          // no fifth Monday in February 2026
});

test('the de-by example region: dates, notes, since', () => {
	const region = cleanRegion(deBy);
	assert.ok(region);
	const list = holidaysOf(region, 2026);
	assert.equal(list.length, 14);
	const byKey = Object.fromEntries(list.map(x => [x.key, x]));
	assert.equal(iso(byKey.goodFriday.date), '2026-04-03');
	assert.equal(iso(byKey.easterMonday.date), '2026-04-06');
	assert.equal(iso(byKey.ascension.date), '2026-05-14');
	assert.equal(iso(byKey.whitMonday.date), '2026-05-25');
	assert.equal(iso(byKey.corpusChristi.date), '2026-06-04');
	assert.equal(byKey.augsburgPeace.note, 'augsburg');
	assert.equal(byKey.assumption.note, 'catholic');
	assert.equal(byKey.newYear.note, null);
	/* sorted by date */
	for (let i = 1; i < list.length; i++) assert.ok(list[i - 1].date <= list[i].date);
	/* German Unity Day exists since 1990 */
	assert.ok(!holidaysOf(region, 1989).some(x => x.key === 'germanUnity'));
	assert.ok(holidaysOf(region, 1990).some(x => x.key === 'germanUnity'));
});

test('two holidays on one day are both kept', () => {
	const region = cleanRegion(deBy);
	const days = byDay(holidaysOf(region, 2008)); // Ascension fell on 1 May 2008
	const may1 = days.get(dayKey(new Date(2008, 4, 1)));
	assert.deepEqual(may1.map(x => x.key), ['labourDay', 'ascension']);
});

test('cleanRegion: invalid rules are skipped and reported, leap days only in leap years', () => {
	const warnings = [];
	const region = cleanRegion({
		id: 'xx-test',
		name: { en: 'Test' },
		fixed: [[2, 29, 'leap'], [13, 1, 'bad'], [2, 30, 'bad'], [1, 1, 'with space'], [3, 3, 'ok', { since: 'x', note: 'n', name: { en: 'Own' } }], 'nope'],
		easter: [[0, 'easterSunday'], [999, 'far']],
		weekday: [[11, 4, 4, 'thanksgiving'], [11, 8, 1, 'bad'], [11, 4, 0, 'bad']]
	}, msg => warnings.push(msg));
	assert.equal(region.fixed.length, 2);
	assert.equal(region.easter.length, 1);
	assert.equal(region.weekday.length, 1);
	assert.ok(warnings.length >= 7);
	assert.ok(holidaysOf(region, 2024).some(x => x.key === 'leap'));
	assert.ok(!holidaysOf(region, 2026).some(x => x.key === 'leap'));
	const own = holidaysOf(region, 2026).find(x => x.key === 'ok');
	assert.deepEqual(own.name, { en: 'Own' });
	assert.equal(own.note, 'n');
	assert.equal(cleanRegion({ id: 'Bad Id' }, () => {}), null);
	assert.equal(cleanRegion(null, () => {}), null);
});

test('no region, no holidays', () => {
	assert.deepEqual(holidaysOf(null, 2026), []);
	assert.deepEqual(holidaysOf(cleanRegion(deBy), 2026.5), []);
});
