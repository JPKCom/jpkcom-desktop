/* JPKCom Desktop — tests: weather conditions, config/stored values, units, providers — © Jean Pierre Kolb — MIT License */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	wmoCondition, glyphOf, conditionOf, cleanConfig, cleanPrefs, checkPrefs, cleanData, temperature, speed,
	pickHours, dayRange, round2, CONDITIONS
} from '../src/modules/weather/core.js';
import openMeteo, { requestUrl, fromApi as fromOpenMeteo } from '../src/modules/weather/providers/open-meteo.js';
import brightsky, { requestUrls, fromApi as fromBrightSky } from '../src/modules/weather/providers/brightsky.js';

test('WMO codes map to condition keys, every condition has an icon', () => {
	assert.equal(wmoCondition(0, true), 'clear-day');
	assert.equal(wmoCondition(0, false), 'clear-night');
	assert.equal(wmoCondition(2, false), 'partly-cloudy-night');
	assert.equal(wmoCondition(3), 'cloudy');
	assert.equal(wmoCondition(45), 'fog');
	assert.equal(wmoCondition(53), 'rain');
	assert.equal(wmoCondition(81), 'rain');
	assert.equal(wmoCondition(67), 'sleet');
	assert.equal(wmoCondition(75), 'snow');
	assert.equal(wmoCondition(95), 'thunderstorm');
	assert.equal(wmoCondition(99), 'hail');
	assert.equal(wmoCondition(42), null);
	assert.equal(wmoCondition('0'), null);
	for (const c of CONDITIONS) assert.match(glyphOf(c), /^ti-/);
	assert.equal(glyphOf('nonsense'), 'ti-temperature');
	assert.equal(conditionOf('rain'), 'rain');
	assert.equal(conditionOf('__proto__'), null);
});

test('config: invalid places dropped, default place and units fall back', () => {
	const warnings = [];
	const cfg = cleanConfig({
		provider: 'Bad!', units: 'kelvin', defaultPlace: 'nowhere',
		places: [
			{ id: 'berlin', name: 'Berlin', lat: 52.52, lon: 13.405, tz: 'Europe/Berlin' },
			{ id: 'berlin', name: 'Twice', lat: 1, lon: 1 },
			{ id: 'here', name: 'Reserved', lat: 1, lon: 1 },
			{ id: 'mars', name: 'Mars', lat: 120, lon: 0 },
			{ id: 'tokyo', name: { en: 'Tokyo', de: 'Tokio' }, lat: 35.676, lon: 139.65, tz: 'Not/AZone' }
		],
		freshMs: 5
	}, msg => warnings.push(msg));
	assert.equal(cfg.provider, 'open-meteo');
	assert.equal(cfg.units, 'metric');
	assert.deepEqual(cfg.places.map(p => p.id), ['berlin', 'tokyo']);
	assert.equal(cfg.places[1].tz, null);
	assert.equal(cfg.defaultPlace, 'berlin');
	assert.equal(cfg.freshMs, 900000);
	assert.ok(cfg.maxAgeMs >= cfg.freshMs);
	assert.ok(warnings.length >= 6);
});

test('stored place: "here" only with coordinates, rounded to two decimals', () => {
	const places = [{ id: 'berlin' }, { id: 'tokyo' }];
	assert.deepEqual(cleanPrefs({ place: 'here' }, places, 'berlin'), { place: 'berlin', lat: null, lon: null });
	assert.deepEqual(cleanPrefs({ place: 'here', lat: 48.37123, lon: 10.8987 }, places, 'berlin'), { place: 'here', lat: 48.37, lon: 10.9 });
	assert.deepEqual(cleanPrefs({ place: 'tokyo', lat: 200, lon: 0 }, places, 'berlin'), { place: 'tokyo', lat: null, lon: null });
	assert.deepEqual(cleanPrefs('junk', places, 'berlin').place, 'berlin');
	assert.deepEqual(checkPrefs({ place: 'x y', lat: 1.234, lon: 2 }), { lat: 1.23, lon: 2 });
	assert.equal(checkPrefs([]), null);
	assert.equal(round2(10.899), 10.9);
});

test('cleanData: required fields, at most six hours, unknown icons dropped', () => {
	assert.equal(cleanData({ key: 'k', at: 1 }), null);
	assert.equal(cleanData(null), null);
	const d = cleanData({
		key: 'open-meteo:1,2', at: 1000, temp: 12.3, icon: 'evil', humidity: '50', station: '  Somewhere  ',
		hours: Array.from({ length: 9 }, (_, i) => ({ t: i, temp: i, icon: 'rain', pop: i === 0 ? 'x' : 40 })).concat([{ t: 'x', temp: 1 }])
	});
	assert.equal(d.icon, null);
	assert.equal(d.humidity, null);
	assert.equal(d.time, 1000);
	assert.equal(d.station, 'Somewhere');
	assert.equal(d.hours.length, 6);
	assert.equal(d.hours[0].pop, null);
});

test('cleanData: no stamps from the future or beyond what a Date holds', () => {
	const now = 1_700_000_000_000;
	const base = { key: 'open-meteo:52.52,13.41', temp: 20 };
	assert.equal(cleanData({ ...base, at: now + 30 * 86400000 }, now), null);
	assert.equal(cleanData({ ...base, at: now + 60000 }, now).at, now + 60000);   // small clock drift is fine
	assert.equal(cleanData({ ...base, at: 9e15 }, now), null);
	const d = cleanData({ ...base, at: now, time: 9e15, hours: [{ t: 9e15, temp: 1 }, { t: now + 3600000, temp: 2 }] }, now);
	assert.equal(d.time, now);
	assert.deepEqual(d.hours.map(x => x.temp), [2]);
	assert.doesNotThrow(() => new Date(d.time).toISOString());
	/* Without `now` the real clock counts; a store passing only the value works */
	assert.equal(cleanData({ ...base, at: Date.now() + 30 * 86400000 }), null);
	assert.ok(cleanData({ ...base, at: Date.now() }));
});

test('units: Fahrenheit and mph, never "-0"', () => {
	assert.equal(temperature(0, 'imperial'), 32);
	assert.equal(temperature(100, 'imperial'), 212);
	assert.equal(temperature(-0.4, 'metric'), 0);
	assert.ok(!Object.is(temperature(-0.4, 'metric'), -0));
	assert.equal(speed(100, 'imperial'), 62);
	assert.equal(speed(12.4, 'metric'), 12);
});

test('hours and day range', () => {
	const now = Date.UTC(2026, 9, 6, 10);
	const list = Array.from({ length: 30 }, (_, i) => ({ t: now + (i - 3) * 3600000, temp: i }));
	const hours = pickHours(list, now);
	assert.equal(hours.length, 6);
	assert.equal(hours[0].t, now + 3600000);
	assert.equal(hours[1].t, now + 3 * 3600000);
	const { hi, lo } = dayRange(list, now, 'UTC');
	assert.equal(lo, 0);
	assert.equal(hi, 16); // 07:00 … 23:00 UTC
});

test('Open-Meteo: request and answer', () => {
	const url = new URL(requestUrl({ lat: 52.52, lon: 13.41, tz: 'Europe/Berlin' }));
	assert.equal(url.host, openMeteo.hosts[0]);
	assert.equal(url.searchParams.get('timezone'), 'Europe/Berlin');
	assert.equal(url.searchParams.get('timeformat'), 'unixtime');
	assert.equal(new URL(requestUrl({ lat: 1, lon: 2, tz: null })).searchParams.get('timezone'), 'auto');

	const now = Date.UTC(2026, 9, 6, 10, 20) ;
	const base = Date.UTC(2026, 9, 6, 0) / 1000;
	const times = Array.from({ length: 48 }, (_, i) => base + i * 3600);
	const r = fromOpenMeteo({
		current: { time: now / 1000, temperature_2m: 14.2, relative_humidity_2m: 71, weather_code: 61, wind_speed_10m: 11.5, is_day: 1 },
		hourly: { time: times, temperature_2m: times.map((_, i) => i / 2), weather_code: times.map(() => 3), precipitation_probability: times.map(() => 40), is_day: times.map(() => 1) },
		daily: { temperature_2m_max: [18.1, 17], temperature_2m_min: [9.4, 8] }
	}, now);
	assert.equal(r.temp, 14.2);
	assert.equal(r.icon, 'rain');
	assert.equal(r.humidity, 71);
	assert.equal(r.wind, 11.5);
	assert.equal(r.hi, 18.1);
	assert.equal(r.lo, 9.4);
	assert.equal(r.hours.length, 6);
	assert.equal(r.hours[0].t, Date.UTC(2026, 9, 6, 11));
	assert.equal(r.hours[0].icon, 'cloudy');

	/* No current block: the nearest hour stands in */
	const r2 = fromOpenMeteo({ hourly: { time: times, temperature_2m: times.map(() => 5), weather_code: times.map(() => 0), is_day: times.map(() => 0) } }, now);
	assert.equal(r2.temp, 5);
	assert.equal(r2.icon, 'clear-night');
	assert.equal(fromOpenMeteo(null, now).temp, null);
});

test('Bright Sky: requests and answer', () => {
	const now = Date.UTC(2026, 9, 6, 10);
	const urls = requestUrls({ lat: 48.37, lon: 10.9, tz: 'Europe/Berlin', now });
	assert.ok(urls.current.startsWith(`https://${brightsky.hosts[0]}/current_weather?`));
	assert.match(urls.forecast, /date=2026-10-06/);
	assert.match(urls.forecast, /tz=Europe%2FBerlin/);

	const fc = { weather: Array.from({ length: 24 }, (_, i) => ({ timestamp: new Date(now + (i - 2) * 3600000).toISOString(), temperature: 10 + i, icon: 'cloudy', precipitation_probability: 10 })) };
	const cur = { weather: { timestamp: new Date(now).toISOString(), temperature: 12, icon: 'partly-cloudy-day', relative_humidity: 60, wind_speed_30: 9, source_id: 7 }, sources: [{ id: 7, station_name: 'Augsburg' }] };
	const r = fromBrightSky(cur, fc, now, 'Europe/Berlin');
	assert.equal(r.temp, 12);
	assert.equal(r.icon, 'partly-cloudy-day');
	assert.equal(r.wind, 9);
	assert.equal(r.station, 'Augsburg');
	assert.equal(r.hours.length, 6);
	assert.ok(r.hi >= r.lo);
	/* Forecast only */
	const r2 = fromBrightSky(undefined, fc, now, 'Europe/Berlin');
	assert.equal(r2.temp, 12);
	assert.equal(r2.station, null);
});
