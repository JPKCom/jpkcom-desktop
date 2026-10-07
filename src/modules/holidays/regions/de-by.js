/* JPKCom Desktop — holiday region example: Bavaria (Germany) — © Jean Pierre Kolb — MIT License

   Chosen with config.holidays.region = 'de-by'. A region file is plain data
   (format: src/modules/holidays/core.js); copy it to describe another region,
   or call Desk.holidays.addRegion({ … }) from a site module.

   Months count from 1. Names are the keys of the 'holidays' locale namespace
   (locales/<lang>/holidays.js); notes are 'note-<note>' there.

   The Augsburg Peace Festival (8 August) is a public holiday in the city of
   Augsburg only — it shows how a local holiday carries a note. Assumption Day
   is a holiday in Bavarian municipalities with a predominantly Catholic
   population. German Unity Day exists since 1990. */

export default {
	id: 'de-by',
	name: '@holidays.region-de-by',
	fixed: [
		[1, 1, 'newYear'],
		[1, 6, 'epiphany'],
		[5, 1, 'labourDay'],
		[8, 8, 'augsburgPeace', { note: 'augsburg' }],
		[8, 15, 'assumption', { note: 'catholic' }],
		[10, 3, 'germanUnity', { since: 1990 }],
		[11, 1, 'allSaints'],
		[12, 25, 'christmas'],
		[12, 26, 'boxingDay']
	],
	easter: [
		[-2, 'goodFriday'],
		[1, 'easterMonday'],
		[39, 'ascension'],
		[50, 'whitMonday'],
		[60, 'corpusChristi']
	]
};
