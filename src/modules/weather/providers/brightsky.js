/* JPKCom Desktop — weather provider: Bright Sky (data of the German Weather Service, Germany only) — © Jean Pierre Kolb — MIT License

   https://brightsky.dev/ — a free JSON API over the open data of the
   Deutscher Wetterdienst (DWD); covers Germany. Two requests per refresh,
   either one is enough: the latest observation (current_weather) and the
   hourly forecast (weather). Bright Sky's icon values are the condition keys
   the desktop uses. Provider contract: see ./open-meteo.js. */

import { num, conditionOf, nearest, pickHours, dayRange, dayIn } from '../core.js';

const API = 'https://api.brightsky.dev';

/** The two request URLs (exported for tests) */
export function requestUrls({ lat, lon, tz, now }) {
	const zone = tz || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
	const q = `lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&tz=${encodeURIComponent(zone)}`;
	const until = new Date(now + 25 * 3600000);
	return {
		current: `${API}/current_weather?${q}`,
		forecast: `${API}/weather?${q}&date=${dayIn(now, tz)}&last_date=${encodeURIComponent(until.toISOString())}`
	};
}

/** The observation and the hourly forecast → the provider result (exported for tests) */
export function fromApi(cur, fc, now, tz) {
	const list = (Array.isArray(fc?.weather) ? fc.weather : [])
		.map(x => ({
			t: Date.parse(x?.timestamp), temp: num(x?.temperature), icon: conditionOf(x?.icon), pop: num(x?.precipitation_probability),
			wind: num(x?.wind_speed), humidity: num(x?.relative_humidity)
		}))
		.filter(x => Number.isFinite(x.t) && x.temp !== null)
		.sort((a, b) => a.t - b.t);
	const w = cur?.weather;
	const station = (Array.isArray(cur?.sources) ? cur.sources : []).find(s => s?.id === w?.source_id)?.station_name;
	/* Without an observation, the forecast hour closest to now stands in */
	const near = nearest(list, now);
	const { hi, lo } = dayRange(list, now, tz);
	return {
		time: Date.parse(w?.timestamp) || near?.t,
		temp: num(w?.temperature) ?? near?.temp ?? null,
		icon: conditionOf(w?.icon) ?? near?.icon ?? null,
		humidity: num(w?.relative_humidity) ?? near?.humidity ?? null,
		wind: num(w?.wind_speed_10) ?? num(w?.wind_speed_30) ?? num(w?.wind_speed_60) ?? near?.wind ?? null,
		hi, lo,
		station: typeof station === 'string' ? station : null,
		hours: pickHours(list, now).map(({ t, temp, icon, pop }) => ({ t, temp, icon, pop }))
	};
}

export default {
	id: 'brightsky',
	name: 'Bright Sky',
	hosts: ['api.brightsky.dev'],
	coverage: '@weather.coverageGermany',

	attribution({ h, fill }) {
		return fill('weather.attrBrightSky', {
			source: h('abbr', { lang: 'de', title: 'Deutscher Wetterdienst', text: 'DWD' })
		});
	},

	async load(q, { getJson }) {
		const urls = requestUrls(q);
		const [cur, fc] = await Promise.allSettled([getJson(urls.current), getJson(urls.forecast)]);
		if (cur.status === 'rejected' && fc.status === 'rejected') throw cur.reason;
		return fromApi(cur.value, fc.value, q.now, q.tz);
	}
};
