/* JPKCom Desktop — weather strings: English (reference locale) — © Jean Pierre Kolb — MIT License

   Namespace 'weather' (src/modules/weather). Values come formatted with their
   unit ({value}: '12 km/h', '64 %', '18 °C'); {place}: a place's name;
   {cond}: a condition text; {source}: the data source (a link or abbreviation). */
export default {

	/* Online service (Settings → Online services) */
	service: 'Weather in the menu bar',
	serviceHint: 'Temperature in the menu bar, details in the calendar; the provider receives the coordinates of the chosen place',
	geoService: 'My location for the weather',
	geoServiceHint: 'Your browser’s position, rounded to about 1 km, chooses the weather place',

	/* Menu bar button */
	mbLabel: 'Weather: {temp}, {cond}, {place}',
	mbTitle: '{cond} · {place}',

	/* Calendar section */
	sectionTitle: 'Weather · {place}',
	loading: 'Loading the weather …',
	error: 'Weather currently unavailable',
	retry: 'Try again',
	refresh: 'Refresh weather',
	asOf: 'As of {time}',
	failed: 'Refresh failed',
	wind: 'Wind {value}',
	humidity: 'Humidity {value}',
	rainChance: 'Chance of rain {value}',
	high: 'High {value}',
	low: 'Low {value}',
	hours: 'The next hours',
	/* Hours of the forecast: 'hour' (14) or 'hour-minute' (14:00) */
	hourFormat: 'hour-minute',

	/* Attribution of the providers */
	attrOpenMeteo: 'Weather data: {source}',
	attrBrightSky: 'Data: {source} via Bright Sky',

	/* Settings rows */
	here: 'My location',
	place: 'Place',
	coverageWorld: 'Places worldwide',
	coverageGermany: 'For places in Germany',
	locate: 'Use my location',
	locateBtn: 'Use location',
	locating: 'Finding your location …',
	locateHint: 'Your browser asks first. The place is stored rounded to about 1 km.',
	locateFail: 'Location unavailable — the browser did not share it.',

	/* Storage labels (backup, reset) */
	prefsLabel: 'Weather place',
	dataLabel: 'Last weather data',

	/* Conditions */
	'cond-clear-day': 'Clear',
	'cond-clear-night': 'Clear',
	'cond-partly-cloudy-day': 'Partly cloudy',
	'cond-partly-cloudy-night': 'Partly cloudy',
	'cond-cloudy': 'Cloudy',
	'cond-fog': 'Fog',
	'cond-wind': 'Windy',
	'cond-rain': 'Rain',
	'cond-sleet': 'Sleet',
	'cond-snow': 'Snow',
	'cond-hail': 'Hail',
	'cond-thunderstorm': 'Thunderstorm',
	'cond-none': 'Not available'
};
