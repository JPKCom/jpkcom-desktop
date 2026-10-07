/* JPKCom Desktop — public holiday strings: English (reference locale) — © Jean Pierre Kolb — MIT License

   Namespace 'holidays' (src/modules/holidays). Holiday names are the keys a
   region uses (src/modules/holidays/regions/*.js); notes are 'note-<note>';
   region names 'region-<id>'. A new region adds its keys here in every language
   (or gives its holidays a name: { lang: text } of their own). */
export default {
	/* Heading of the list under the month: {region} is the region's name */
	title: 'Public holidays in {region}',
	titlePlain: 'Public holidays',
	/* A holiday with its note, e.g. in the grid's tooltip */
	withNote: '{name} ({note})',

	/* Regions */
	'region-de-by': 'Bavaria',

	/* Holidays */
	newYear: 'New Year’s Day',
	epiphany: 'Epiphany',
	goodFriday: 'Good Friday',
	easterMonday: 'Easter Monday',
	labourDay: 'Labour Day',
	ascension: 'Ascension Day',
	whitMonday: 'Whit Monday',
	corpusChristi: 'Corpus Christi',
	augsburgPeace: 'Augsburg Peace Festival',
	assumption: 'Assumption Day',
	germanUnity: 'German Unity Day',
	allSaints: 'All Saints’ Day',
	christmas: 'Christmas Day',
	boxingDay: 'Boxing Day',

	/* Notes */
	'note-augsburg': 'Augsburg only',
	'note-catholic': 'in predominantly Catholic municipalities'
};
