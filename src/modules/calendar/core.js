/* JPKCom Desktop — calendar: ISO weeks and the month grid (pure) — © Jean Pierre Kolb — MIT License

   Weekdays are numbered as in ISO 8601 and Intl.Locale weekInfo: 1 = Monday … 7 = Sunday.
   No DOM, no desktop imports — tests use these functions directly. */

/** ISO 8601 week number: the week with the year's first Thursday is week 1. */
export function isoWeek(date) {
	const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
	d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
	const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
	return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

export const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const pad = n => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' of the local day (for <time datetime>) */
export const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** ISO weekday of a date: 1 = Monday … 7 = Sunday */
export const isoDay = d => d.getDay() || 7;

/** The weekday shown in column i (0–6) when weeks start on firstDay */
export const columnDay = (i, firstDay) => ((firstDay - 1 + i) % 7) + 1;

/** A date that falls on an ISO weekday (for weekday names): 1 January 2024 was a Monday */
export const sampleDay = weekday => new Date(2024, 0, weekday);

/**
 * The first day of the week: config.calendar.firstDay (1–7) wins, 'auto'
 * takes the language's weekInfo().firstDay, anything else → Monday.
 */
export function resolveFirstDay(setting, weekInfo) {
	if (Number.isInteger(setting) && setting >= 1 && setting <= 7) return setting;
	const auto = weekInfo?.firstDay;
	return Number.isInteger(auto) && auto >= 1 && auto <= 7 ? auto : 1;
}

/**
 * Six rows of seven days for a month (always six, so the popover keeps its
 * height while paging). Each row: { week, days: [Date × 7] }; week is the ISO
 * week of the row's Monday (a row that starts on Sunday shows the week most of
 * its days belong to).
 */
export function monthGrid(y, m, firstDay = 1) {
	const first = new Date(y, m, 1);
	const offset = (isoDay(first) - firstDay + 7) % 7;
	const rows = [];
	for (let r = 0; r < 6; r++) {
		const days = [];
		for (let i = 0; i < 7; i++) days.push(new Date(y, m, 1 - offset + r * 7 + i));
		const monday = days.find(d => isoDay(d) === 1);
		rows.push({ week: isoWeek(monday), days });
	}
	return rows;
}

/** The month after adding delta months: { y, m } */
export function shiftMonth({ y, m }, delta) {
	const d = new Date(y, m + delta, 1);
	return { y: d.getFullYear(), m: d.getMonth() };
}
