/* JPKCom Desktop — feed notification strings: English (reference locale) — © Jean Pierre Kolb — MIT License

   Namespace 'notify' (src/modules/notify). {n}: a count. "Today", "Yesterday"
   and "(new)" come from the core namespace. */
export default {
	/* Settings → General */
	toggle: 'Notifications for new articles',
	toggleHint: 'Banners for new articles in this site’s news feed',

	/* The list under the calendar */
	sectionTitle: 'New articles',

	/* Summary banner when more arrived than banners are shown */
	more: { one: 'And {n} more new article', other: 'And {n} more new articles' },
	newCount: { one: '{n} new article', other: '{n} new articles' },

	/* Storage label (backup, reset) */
	seenLabel: 'Articles already announced'
};
