/* JPKCom Desktop — weather provider: Open-Meteo (worldwide, no key) — © Jean Pierre Kolb — MIT License

   https://open-meteo.com/ — free weather API without an API key, CORS enabled.
   Data under CC BY 4.0: the attribution names and links the source.
   One request per refresh (current conditions, hourly forecast, today's range).

   Provider contract (src/modules/weather/index.js → addProvider):
     { id, name, hosts: [host], coverage?: text,
       attribution(ctx) → Node | string        ctx: { h, t, fill(key, { name: Node }) }
       async load({ lat, lon, tz, now }, { getJson }) → { time, temp, icon, humidity, wind, hi, lo, station, hours: [{ t, temp, icon, pop }] }
     }
   Values in °C, km/h and %, times in ms since the epoch, icon = a condition key (../core.js CONDITIONS).
   getJson(url) is bound to the 'weather' service: it refuses to fetch without consent. */

import { num, wmoCondition, nearest, pickHours } from '../core.js';

const API = 'https://api.open-meteo.com/v1/forecast';

/** Builds the request URL (exported for tests) */
export function requestUrl({ lat, lon, tz }) {
	const q = new URLSearchParams({
		latitude: String(lat),
		longitude: String(lon),
		current: 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,is_day',
		hourly: 'temperature_2m,weather_code,precipitation_probability,is_day',
		daily: 'temperature_2m_max,temperature_2m_min',
		timezone: tz || 'auto',
		forecast_days: '2',
		timeformat: 'unixtime'
	});
	return `${API}?${q}`;
}

/** The API answer → the provider result (exported for tests) */
export function fromApi(data, now) {
	const h = data?.hourly;
	const times = Array.isArray(h?.time) ? h.time : [];
	const list = times
		.map((s, i) => ({
			t: num(s) !== null ? s * 1000 : NaN,
			temp: num(h.temperature_2m?.[i]),
			icon: wmoCondition(h.weather_code?.[i], h.is_day?.[i] !== 0),
			pop: num(h.precipitation_probability?.[i])
		}))
		.filter(x => Number.isFinite(x.t) && x.temp !== null)
		.sort((a, b) => a.t - b.t);
	const cur = data?.current;
	/* Without current values, the forecast hour closest to now stands in */
	const near = nearest(list, now);
	return {
		time: num(cur?.time) !== null ? cur.time * 1000 : near?.t,
		temp: num(cur?.temperature_2m) ?? near?.temp ?? null,
		icon: wmoCondition(cur?.weather_code, cur?.is_day !== 0) ?? near?.icon ?? null,
		humidity: num(cur?.relative_humidity_2m),
		wind: num(cur?.wind_speed_10m),
		hi: num(data?.daily?.temperature_2m_max?.[0]),
		lo: num(data?.daily?.temperature_2m_min?.[0]),
		station: null,
		hours: pickHours(list, now)
	};
}

export default {
	id: 'open-meteo',
	name: 'Open-Meteo',
	hosts: ['api.open-meteo.com'],
	coverage: '@weather.coverageWorld',

	attribution({ h, fill }) {
		return fill('weather.attrOpenMeteo', {
			source: h('a', { href: 'https://open-meteo.com/', target: '_blank', rel: 'noopener noreferrer', text: 'Open-Meteo.com' })
		});
	},

	async load(q, { getJson }) {
		return fromApi(await getJson(requestUrl(q)), q.now);
	}
};
