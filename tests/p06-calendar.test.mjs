/* JPKCom Desktop — tests: calendar ISO weeks, month grid, first weekday — © Jean Pierre Kolb — MIT License */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isoWeek, monthGrid, columnDay, resolveFirstDay, shiftMonth, ymd, sampleDay, isoDay, sameDay } from '../src/modules/calendar/core.js';

test('ISO 8601 week numbers at year boundaries', () => {
	assert.equal(isoWeek(new Date(2026, 0, 1)), 1);    // Thursday
	assert.equal(isoWeek(new Date(2027, 0, 1)), 53);   // Friday: still week 53 of 2026
	assert.equal(isoWeek(new Date(2024, 11, 30)), 1);  // Monday: week 1 of 2025
	assert.equal(isoWeek(new Date(2021, 0, 3)), 53);   // Sunday
	assert.equal(isoWeek(new Date(2026, 9, 6)), 41);
});

test('month grid: six rows of seven, starting on the first weekday', () => {
	const rows = monthGrid(2026, 9, 1); // October 2026, Monday first
	assert.equal(rows.length, 6);
	assert.ok(rows.every(r => r.days.length === 7));
	assert.equal(ymd(rows[0].days[0]), '2026-09-28');
	assert.equal(rows[0].week, 40);
	assert.ok(rows.every(r => isoDay(r.days[0]) === 1));

	const sunday = monthGrid(2026, 9, 7);
	assert.equal(ymd(sunday[0].days[0]), '2026-09-27');
	assert.equal(sunday[0].week, 40);   // the week of the row's Monday
	assert.ok(sunday.every(r => isoDay(r.days[0]) === 7));

	/* A month that starts on the first weekday starts in the first cell */
	assert.equal(ymd(monthGrid(2026, 5, 1)[0].days[0]), '2026-06-01');
});

test('columns, first day, paging', () => {
	assert.deepEqual(Array.from({ length: 7 }, (_, i) => columnDay(i, 1)), [1, 2, 3, 4, 5, 6, 7]);
	assert.deepEqual(Array.from({ length: 7 }, (_, i) => columnDay(i, 7)), [7, 1, 2, 3, 4, 5, 6]);
	assert.equal(resolveFirstDay('auto', { firstDay: 7 }), 7);
	assert.equal(resolveFirstDay(3, { firstDay: 7 }), 3);
	assert.equal(resolveFirstDay('auto', null), 1);
	assert.equal(resolveFirstDay(9, { firstDay: 0 }), 1);
	assert.deepEqual(shiftMonth({ y: 2026, m: 11 }, 1), { y: 2027, m: 0 });
	assert.deepEqual(shiftMonth({ y: 2026, m: 0 }, -1), { y: 2025, m: 11 });
	assert.equal(isoDay(sampleDay(1)), 1);
	assert.equal(isoDay(sampleDay(7)), 7);
	assert.ok(sameDay(new Date(2026, 1, 3, 23), new Date(2026, 1, 3, 1)));
});
