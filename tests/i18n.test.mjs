/* JPKCom Desktop — tests: i18n fallback chain, plurals, placeholders, L(), detection — © Jean Pierre Kolb — MIT License */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createI18n, splitKey, addSource, matchLanguage } from '../src/core/i18n.js';
import { createRegistry } from '../src/core/registry.js';

const DICTS = {
	en: {
		core: { hello: 'Hello {name}', items: { one: '{n} item', other: '{n} items' }, onlyEn: 'English only', count: 'Count: {n}' },
		notes: { title: 'Notes', empty: { '=0': 'No notes', one: 'One note', other: '{n} notes' } }
	},
	de: {
		core: { hello: 'Hallo {name}', items: { one: '{n} Objekt', other: '{n} Objekte' }, count: 'Anzahl: {n}', keyCtrl: 'Strg', keyShift: 'Umschalt', keyJoin: '+' },
		notes: { title: 'Notizen' }
	},
	'pt-BR': { core: { hello: 'Olá {name}' } },
	pt: { core: { hello: 'Olá (pt) {name}', items: { one: '{n} item', other: '{n} itens' } } },
	fr: { core: {} }
};
const METAS = {
	en: { name: 'English', intl: 'en-GB', dir: 'ltr', yes: '^(y|yes)$' },
	de: { name: 'Deutsch', intl: 'de-DE', dir: 'ltr', yes: '^(j|ja|y|yes)$' },
	pt: { name: 'Português', intl: 'pt-PT', dir: 'ltr' },
	'pt-BR': { name: 'Português (Brasil)', intl: 'pt-BR', dir: 'ltr' },
	fr: { name: 'Français', intl: 'fr-FR', dir: 'ltr', yes: '^(o|oui|y|yes)$' },
	ar: { name: 'العربية', intl: 'ar', dir: 'rtl' },
	/* a private-use code (RFC 5646 qaa–qtz): an offered language the runtime has no Intl data for */
	qaa: { name: 'Qaaish', intl: 'qaa', dir: 'ltr' }
};

async function make({ languages = ['de', 'en'], defaultLang = 'en', lang } = {}) {
	const changes = [];
	const i18n = createI18n({
		languages, defaultLang,
		load: async (code, ns) => {
			if (!DICTS[code]?.[ns]) throw new Error('missing');
			return DICTS[code][ns];
		},
		loadMeta: async code => METAS[code] ?? null,
		onChange: e => changes.push(e),
		warn: () => {}
	});
	await i18n.loadMetas();
	if (lang) i18n.init(lang);
	await i18n.use(['core', 'notes']);
	return { i18n, changes };
}

test('splitKey: namespace before the first dot, core by default', () => {
	assert.deepEqual(splitKey('notes.title'), ['notes', 'title']);
	assert.deepEqual(splitKey('hello'), ['core', 'hello']);
	assert.deepEqual(splitKey('settings.accent.blue'), ['settings', 'accent.blue']);
});

test('t(): named placeholders, unqualified keys go to core', async () => {
	const { i18n } = await make({ lang: 'de' });
	assert.equal(i18n.t('hello', { name: 'Ada' }), 'Hallo Ada');
	assert.equal(i18n.t('core.hello', { name: 'Ada' }), 'Hallo Ada');
	assert.equal(i18n.t('notes.title'), 'Notizen');
	/* unknown placeholders stay visible */
	assert.equal(i18n.t('hello'), 'Hallo {name}');
});

test('t(): numbers in placeholders are formatted for the language', async () => {
	const { i18n } = await make({ lang: 'de' });
	assert.equal(i18n.t('count', { n: 1234.5 }), 'Anzahl: 1234,5');
	assert.equal(i18n.t('count', { n: 12345 }), 'Anzahl: 12.345');
	/* years and other four-digit numbers are never grouped (no '2.026') */
	assert.equal(i18n.t('count', { n: 2026 }), 'Anzahl: 2026');
	const en = await make({ lang: 'en' });
	assert.equal(en.i18n.t('count', { n: 1234.5 }), 'Count: 1234.5');
	assert.equal(en.i18n.t('count', { n: 1234567 }), 'Count: 1,234,567');
});

test('keys(): shortcut hints in the language, symbols on request', async () => {
	const de = await make({ lang: 'de' });
	assert.equal(de.i18n.keys('Mod+K', { symbols: false }), 'Strg+K');
	assert.equal(de.i18n.keys('Mod+Shift+ArrowLeft', { symbols: false }), 'Strg+Umschalt+←');
	assert.equal(de.i18n.keys('Mod++', { symbols: false }), 'Strg++');
	assert.equal(de.i18n.keys('Mod+K', { symbols: true }), '⌘K');
	const en = await make({ lang: 'en' });
	/* no key names in the dictionary: the English names */
	assert.equal(en.i18n.keys('Mod+Alt+w', { symbols: false }), 'Ctrl+Alt+W');
});

test('t(): fallback chain lang → base → defaultLang → en → key', async () => {
	const { i18n } = await make({ languages: ['pt-BR', 'pt', 'de', 'en'], defaultLang: 'de', lang: 'pt-BR' });
	assert.deepEqual(i18n.chain(), ['pt-BR', 'pt', 'de', 'en']);
	assert.equal(i18n.t('hello', { name: 'Ana' }), 'Olá Ana');               // own
	assert.equal(i18n.t('items', { n: 2 }), '2 itens');                       // base language
	assert.equal(i18n.t('count', { n: 3 }), 'Anzahl: 3');                     // defaultLang (de) before en
	assert.equal(i18n.t('onlyEn'), 'English only');                           // en
	assert.equal(i18n.t('nope.missing'), 'nope.missing');                     // the key itself
});

test('t(): a third language without translations falls back without crashing', async () => {
	const { i18n } = await make({ languages: ['fr', 'de', 'en'], defaultLang: 'en', lang: 'fr' });
	assert.equal(i18n.t('hello', { name: 'Zoé' }), 'Hello Zoé');
	assert.equal(i18n.t('notes.empty', { n: 0 }), 'No notes');
});

test('plurals: Intl.PluralRules per language, exact =N forms first', async () => {
	const { i18n } = await make({ lang: 'en' });
	assert.equal(i18n.t('items', { n: 1 }), '1 item');
	assert.equal(i18n.t('items', { n: 5 }), '5 items');
	assert.equal(i18n.t('items', { count: 1 }), '1 item');
	assert.equal(i18n.t('notes.empty', { n: 0 }), 'No notes');
	assert.equal(i18n.t('notes.empty', { n: 1 }), 'One note');
	assert.equal(i18n.t('notes.empty', { n: 7 }), '7 notes');
	/* without a number: the 'other' form */
	assert.equal(i18n.t('items'), '{n} items');
	const de = await make({ lang: 'de' });
	assert.equal(de.i18n.t('items', { n: 1 }), '1 Objekt');
	assert.equal(de.i18n.t('items', { n: 1000 }), '1000 Objekte');
	assert.equal(de.i18n.t('items', { n: 10000 }), '10.000 Objekte');
});

test('L(): string, @reference and language maps with the full chain', async () => {
	const { i18n } = await make({ languages: ['pt-BR', 'pt', 'de', 'en'], defaultLang: 'de', lang: 'pt-BR' });
	assert.equal(i18n.L('Plain'), 'Plain');
	assert.equal(i18n.L(null), '');
	assert.equal(i18n.L('@notes.title'), 'Notizen');
	assert.equal(i18n.L({ 'pt-BR': 'BR', pt: 'PT', en: 'EN' }), 'BR');
	assert.equal(i18n.L({ pt: 'PT', en: 'EN' }), 'PT');
	assert.equal(i18n.L({ de: 'DE', en: 'EN' }), 'DE');            // defaultLang before en
	assert.equal(i18n.L({ en: 'EN', fr: 'FR' }), 'EN');
	assert.equal(i18n.L({ fr: 'FR', es: 'ES' }), 'FR');            // first value
	const de = await make({ lang: 'de' });
	assert.equal(de.i18n.L({ 'de-AT': 'Servus', en: 'Hello' }), 'Servus'); // regional key matches the base
});

test('detect(): query → stored → browser exact → browser base → default', async () => {
	const { i18n } = await make({ languages: ['de', 'en', 'pt-BR'] });
	assert.equal(i18n.detect({ query: 'en', stored: 'de' }), 'en');
	assert.equal(i18n.detect({ query: 'xx', stored: 'de' }), 'de');
	assert.equal(i18n.detect({ preferred: ['fr-FR', 'de-AT'] }), 'de');
	assert.equal(i18n.detect({ preferred: ['pt-PT'] }), 'pt-BR');
	assert.equal(i18n.detect({ preferred: ['PT-br'] }), 'pt-BR');
	assert.equal(i18n.detect({ preferred: ['ja'] }), 'en');
	assert.equal(i18n.detect({ query: 'DE' }), 'de', 'query: any case, the offered spelling');
	assert.equal(i18n.detect({ stored: 'xx', preferred: ['pt-br'] }), 'pt-BR');
	assert.equal(i18n.detect({ preferred: 'de' }), 'en', 'not a list: ignored');
	const solo = await make({ languages: ['fr', 'de'], defaultLang: 'en' });
	assert.equal(solo.i18n.detect({ preferred: ['ja'] }), 'fr', 'defaultLang not offered: the first offered language');
});

test('detect(): one preferred language after the other, base language before the next one (RFC 4647 lookup)', async () => {
	const { i18n } = await make({ languages: ['de', 'en'] });
	assert.equal(i18n.detect({ preferred: ['de-AT', 'en'] }), 'de', 'de-AT → de before the exact en');
	assert.equal(i18n.detect({ preferred: ['de-AT', 'en-US'] }), 'de');
	assert.equal(i18n.detect({ preferred: ['en-GB', 'de'] }), 'en');
	assert.equal(i18n.detect({ preferred: ['fr-CA', 'fr', 'de-CH', 'en'] }), 'de', 'unoffered entries are skipped');
	const pt = await make({ languages: ['en', 'pt-BR'] });
	assert.equal(pt.i18n.detect({ preferred: ['pt-PT', 'en'] }), 'pt-BR', 'same base, other region before the next entry');
});

test('matchLanguage(): exact → truncated → same base, per entry; offered spelling; null when nothing fits', () => {
	const offer = ['en', 'de', 'de-CH', 'zh-Hant', 'pt-BR'];
	assert.equal(matchLanguage(offer, ['de-CH']), 'de-CH');
	assert.equal(matchLanguage(offer, ['de-ch-1996']), 'de-CH', 'truncated subtag by subtag');
	assert.equal(matchLanguage(offer, ['de-AT']), 'de');
	assert.equal(matchLanguage(offer, ['zh-hant-TW']), 'zh-Hant');
	assert.equal(matchLanguage(offer, ['de-x-private']), 'de', 'a trailing singleton goes with its subtag');
	assert.equal(matchLanguage(offer, ['de-DE-u-co-phonebk']), 'de');
	assert.equal(matchLanguage(offer, ['pt']), 'pt-BR');
	assert.equal(matchLanguage(offer, ['ja', 'PT-pt', 'en']), 'pt-BR');
	assert.equal(matchLanguage(offer, ['ja', 'ko']), null);
	assert.equal(matchLanguage(offer, []), null);
	assert.equal(matchLanguage(offer, [null, 42, '', '*', 'en']), 'en', 'junk entries are skipped');
	assert.equal(matchLanguage(offer, undefined), null);
	assert.equal(matchLanguage(null, ['en']), null);
	assert.equal(matchLanguage(['de-AT'], ['de-DE']), 'de-AT', 'no plain de offered: the region of the same base');
});

test('setLang(): loads namespaces in use, reports the change, rejects unknown codes', async () => {
	const { i18n, changes } = await make({ languages: ['de', 'en', 'fr'], lang: 'en' });
	assert.equal(await i18n.setLang('xx'), false);
	assert.equal(await i18n.setLang('en'), false);
	assert.equal(await i18n.setLang('de'), true);
	assert.equal(i18n.lang(), 'de');
	assert.deepEqual(changes, [{ lang: 'de', prev: 'en' }]);
	assert.equal(i18n.t('notes.title'), 'Notizen');
});

test('meta, locale(), dir(), isYes(), displayName()', async () => {
	const { i18n } = await make({ languages: ['de', 'en', 'ar'], lang: 'de' });
	assert.equal(i18n.locale(), 'de-DE');
	assert.equal(i18n.dir(), 'ltr');
	assert.equal(i18n.dir('ar'), 'rtl');
	assert.equal(i18n.isYes('Ja'), true);
	assert.equal(i18n.isYes('nein'), false);
	assert.equal(i18n.displayName('de'), 'Deutsch');
	assert.deepEqual(i18n.available(), ['de', 'en', 'ar']);
});

test('displayName(code, inLang): the endonym by default, the name in inLang otherwise', async () => {
	const { i18n } = await make({ languages: ['de', 'en', 'fr', 'pt-BR'], lang: 'de' });
	assert.equal(i18n.displayName('de'), 'Deutsch', 'default: the endonym from meta.name');
	assert.equal(i18n.displayName('en', 'en'), 'English');
	assert.equal(i18n.displayName('en', 'de'), 'Englisch', 'not the endonym in a German sentence');
	assert.equal(i18n.displayName('de', 'en'), 'German');
	assert.equal(i18n.displayName('fr', 'de'), 'Französisch');
	assert.equal(i18n.displayName('pt-BR', 'en'), 'Brazilian Portuguese');
	assert.equal(i18n.displayName('pt-BR'), 'Português (Brasil)');
	assert.equal(i18n.displayName('ja', 'de'), 'Japanisch', 'a language without a locale');
	assert.equal(i18n.displayName('ja'), '日本語', 'no meta: the endonym from Intl');
	assert.equal(i18n.displayName('qq-zz', 'de'), 'qq-zz', 'unknown everywhere: the code');
	assert.equal(i18n.displayName('not a code', 'de'), 'not a code', 'invalid: the code, no throw');
	/* a site's own spelling of its language stays the endonym; another language names it through Intl */
	const site = await make({ languages: ['de', 'en'], lang: 'en' });
	assert.equal(site.i18n.displayName('de', 'en'), 'German');
});

test('displayName(code, inLang): no Intl data for inLang → the endonym, never the runtime default language', async () => {
	const { i18n } = await make({ languages: ['de', 'en', 'qaa'], lang: 'qaa' });
	assert.deepEqual(Intl.DisplayNames.supportedLocalesOf(['qaa']), [], 'fixture: no Intl data for qaa');
	assert.equal(i18n.displayName('de', 'qaa'), 'Deutsch', 'not the name in the runtime default (German)');
	assert.equal(i18n.displayName('en', 'qaa'), 'English');
	assert.equal(i18n.displayName('qaa', 'de'), 'Qaaish', 'no Intl name for the code: the endonym');
	assert.equal(i18n.displayName('qaa'), 'Qaaish');
	assert.equal(i18n.displayName('ja', 'qaa'), 'ja', 'neither Intl data nor an endonym: the code');
	/* the same for a real language whose data a browser leaves out (Intl negotiates down to its UI language) */
	const orig = Intl.DisplayNames.supportedLocalesOf;
	Intl.DisplayNames.supportedLocalesOf = () => [];
	try {
		assert.equal(i18n.displayName('en', 'de'), 'English');
		assert.equal(i18n.displayName('de', 'en'), 'Deutsch');
	} finally {
		Intl.DisplayNames.supportedLocalesOf = orig;
	}
	assert.equal(i18n.displayName('en', 'de'), 'Englisch');
});

test('formatters use the language tag', async () => {
	const { i18n } = await make({ lang: 'de' });
	assert.equal(i18n.fmtNumber(1234.5), '1.234,5');
	assert.equal(i18n.decimalSep(), ',');
	assert.match(i18n.fmtBytes(2048), /^2\s?kB$/);
	assert.match(i18n.fmtBytes(512), /^512\s?(byte|B)/);
	assert.equal(i18n.list(['a', 'b', 'c']), 'a, b und c');
	assert.equal(i18n.pluralCategory(1), 'one');
	assert.equal(i18n.fmtDate(new Date(Date.UTC(2026, 0, 15, 12)), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }), '15. Januar 2026');
	assert.equal(i18n.weekInfo().firstDay, 1);
	const en = await make({ lang: 'en' });
	assert.equal(en.i18n.list(['a', 'b', 'c']), 'a, b and c');
	assert.ok(i18n.compare('ä', 'b') < 0);
});

test('invalid dictionary entries are dropped, missing files do not throw', async () => {
	const i18n = createI18n({
		languages: ['en'], defaultLang: 'en', warn: () => {},
		load: async (code, ns) => (ns === 'bad' ? { ok: 'fine', nope: 42, plural: { one: 'x' } } : Promise.reject(new Error('404')))
	});
	await i18n.use(['bad', 'gone']);
	assert.equal(i18n.t('bad.ok'), 'fine');
	assert.equal(i18n.t('bad.nope'), 'bad.nope');
	assert.equal(i18n.t('bad.plural'), 'bad.plural');
	assert.equal(i18n.t('gone.x'), 'gone.x');
});

/* With the shipped core strings (locales/<lang>/core.js) */
async function real(lang) {
	const i18n = createI18n({
		languages: ['de', 'en'], defaultLang: 'en',
		load: async (code, ns) => (await import(`../locales/${code}/${ns}.js`)).default,
		loadMeta: async code => (await import(`../locales/${code}/_meta.js`)).default,
		warn: () => {}
	});
	await i18n.loadMetas();
	i18n.init(lang);
	await i18n.use(['core']);
	return i18n;
}

test('fmtBytes(): sizes below 1 KB read "161 B" in every language, larger ones keep the Intl units', async () => {
	for (const lang of ['en', 'de']) {
		const i18n = await real(lang);
		assert.equal(i18n.fmtBytes(161), '161 B', lang);
		assert.equal(i18n.fmtBytes(0), '0 B', lang);
		assert.match(i18n.fmtBytes(2048), /^2\s?kB$/, lang);
	}
});

test('keys(): Page Up/Down, Home and End have names and symbols', async () => {
	const en = await real('en');
	assert.equal(en.keys('Alt+PageDown', { symbols: false }), 'Alt+Page Down');
	assert.equal(en.keys('Alt+PageUp', { symbols: false }), 'Alt+Page Up');
	assert.equal(en.keys('Mod+Home', { symbols: false }), 'Ctrl+Home');
	assert.equal(en.keys('Alt+PageDown', { symbols: true }), '⌥⇟');
	assert.equal(en.keys('Mod+End', { symbols: true }), '⌘↘');
	const de = await real('de');
	assert.equal(de.keys('Alt+PageDown', { symbols: false }), 'Alt+Bild↓');
	assert.equal(de.keys('Mod+Home', { symbols: false }), 'Strg+Pos1');
	assert.equal(de.keys('Mod+End', { symbols: false }), 'Strg+Ende');
	assert.equal(de.keys('Alt+PageDown', { symbols: true }), '⌥⇟');
});

/* A loader that waits per language, so a switch can be overtaken by a later one */
async function makeSlow(delays) {
	const changes = [];
	const i18n = createI18n({
		languages: ['de', 'en', 'fr'], defaultLang: 'en',
		load: async (code, ns) => {
			await new Promise(r => setTimeout(r, delays[code] ?? 0));
			if (!DICTS[code]?.[ns]) throw new Error('missing');
			return DICTS[code][ns];
		},
		onChange: e => changes.push(e),
		warn: () => {}
	});
	i18n.init('de');
	await i18n.use(['core', 'notes']);
	return { i18n, changes };
}

test('setLang(): the last request wins over a slower earlier one', async () => {
	const { i18n, changes } = await makeSlow({ fr: 40 });
	const slow = i18n.setLang('fr');
	const fast = i18n.setLang('en');
	assert.deepEqual(await Promise.all([slow, fast]), [false, true]);
	assert.equal(i18n.lang(), 'en');
	assert.deepEqual(changes, [{ lang: 'en', prev: 'de' }]);
});

test('setLang(): choosing the current language cancels a pending switch; a repeated request is ignored', async () => {
	const { i18n, changes } = await makeSlow({ fr: 40 });
	const slow = i18n.setLang('fr');
	assert.equal(await i18n.setLang('fr'), false, 'already on its way');
	assert.equal(await i18n.setLang('de'), false, 'the current language');
	assert.equal(await slow, false);
	assert.equal(i18n.lang(), 'de');
	assert.deepEqual(changes, []);
	assert.equal(await i18n.setLang('fr'), true, 'a later request still works');
	assert.deepEqual(changes, [{ lang: 'fr', prev: 'de' }]);
});

test('resolve(): text plus the language it was found in (fallbacks keep their language)', async () => {
	const { i18n } = await make({ languages: ['de', 'en', 'fr'], lang: 'fr' });
	assert.deepEqual(i18n.resolve('@core.onlyEn'), { text: 'English only', lang: 'en' });
	assert.deepEqual(i18n.resolve('@core.hello', { name: 'A' }), { text: 'Hello A', lang: 'en' });
	assert.deepEqual(i18n.resolve({ de: 'Beschreibung', en: 'Description' }), { text: 'Description', lang: 'en' });
	assert.deepEqual(i18n.resolve({ fr: 'Bonjour', en: 'Hello' }), { text: 'Bonjour', lang: 'fr' });
	assert.deepEqual(i18n.resolve('plain'), { text: 'plain', lang: null });
	assert.deepEqual(i18n.resolve(42), { text: '42', lang: null });
	assert.deepEqual(i18n.resolve(null), { text: '', lang: null });
	assert.deepEqual(i18n.resolve('@core.nope'), { text: 'core.nope', lang: null });
	/* base-language match and the first value as the last resort */
	const { i18n: de } = await make({ languages: ['de', 'en'], lang: 'de' });
	assert.deepEqual(de.resolve({ 'de-AT': 'Servus', en: 'Hi' }), { text: 'Servus', lang: 'de-AT' });
	assert.deepEqual(de.resolve({ it: 'Ciao' }), { text: 'Ciao', lang: 'it' });
	assert.deepEqual(de.resolve({ x_y: 'odd key' }), { text: 'odd key', lang: null });
	/* t() and L() are resolve() without the language */
	assert.equal(i18n.t('core.onlyEn'), 'English only');
	assert.equal(i18n.L({ de: 'Beschreibung', en: 'Description' }), 'Description');
});

test('registry.nameLang(): an app name that fell back to another language reports it (for markLang)', async () => {
	const { i18n } = await make({ languages: ['de', 'en', 'fr'], lang: 'fr' });
	const reg = createRegistry({ L: v => i18n.L(v), R: v => i18n.resolve(v), warn: () => {} });
	reg.load({
		apps: [
			{ id: 'about', kind: 'page', name: { en: 'About', de: 'Über' }, url: 'about.html' },
			{ id: 'home', kind: 'page', name: { fr: 'Accueil', en: 'Home' }, url: 'home.html' },
			{ id: 'plain', kind: 'page', name: 'Plain', url: 'plain.html' },
			{ id: 'keyed', kind: 'page', name: '@core.onlyEn', url: 'keyed.html' }
		]
	});
	assert.equal(reg.name(reg.get('about')), 'About');
	assert.equal(reg.nameLang(reg.get('about')), 'en', 'a { en, de } name in a third language is English');
	assert.equal(reg.nameLang(reg.get('home')), 'fr');
	assert.equal(reg.nameLang(reg.get('plain')), null, 'a plain string has no known language');
	assert.equal(reg.nameLang(reg.get('keyed')), 'en', 'a locale key missing in the language falls back with its language');
	/* Without R (tests, other hosts) nothing is marked */
	assert.equal(createRegistry().nameLang({ name: { en: 'X' } }), null);
});

/* ---------- Namespaces from a module's own folder (descriptor field locales) ---------- */

const MOD = 'https://x.test/site/modules/hello/locales/';
const FILES = {
	[`${MOD}en/hello.js`]: { hi: 'Hi {name}', opens: { one: 'Opened once', other: 'Opened {n} times' } },
	[`${MOD}de/hello.js`]: { hi: 'Hallo {name}' }
};

function withFiles({ languages = ['de', 'en'], defaultLang = 'en' } = {}) {
	const asked = [];
	const i18n = createI18n({
		languages, defaultLang,
		load: async (code, ns) => {
			if (!DICTS[code]?.[ns]) throw new Error('missing');
			return DICTS[code][ns];
		},
		importFile: async url => {
			asked.push(url);
			if (!FILES[url]) throw new Error('404');
			return FILES[url];
		},
		warn: () => {}
	});
	return { i18n, asked };
}

test('addSource(): a namespace from a module folder loads along the fallback chain', async () => {
	const { i18n, asked } = withFiles();
	i18n.init('de');
	assert.equal(addSource(i18n, 'hello', MOD), true);
	await i18n.use('hello');
	assert.equal(i18n.t('hello.hi', { name: 'Alex' }), 'Hallo Alex');
	assert.equal(i18n.t('hello.opens', { n: 3 }), 'Opened 3 times', 'a key missing in de comes from en');
	assert.deepEqual(asked.sort(), [`${MOD}de/hello.js`, `${MOD}en/hello.js`]);
	await i18n.setLang('en');
	assert.equal(i18n.t('hello.hi', { name: 'Alex' }), 'Hi Alex');
	assert.equal(i18n.t('hello.opens', { n: 1 }), 'Opened once');
});

test('addSource(): a missing language file falls back without throwing', async () => {
	const { i18n } = withFiles({ languages: ['fr', 'en'] });
	i18n.init('fr');
	assert.equal(addSource(i18n, 'hello', MOD), true);
	await i18n.use('hello');
	assert.equal(i18n.t('hello.hi', { name: 'A' }), 'Hi A');
});

test('addSource(): refuses namespaces in use, a second folder and invalid input', async () => {
	const { i18n } = withFiles();
	await i18n.use('notes');
	assert.equal(addSource(i18n, 'notes', MOD), false, 'already loaded from locales/');
	assert.equal(addSource(i18n, 'hello', MOD), true);
	assert.equal(addSource(i18n, 'hello', MOD), true, 'the same folder again is fine');
	assert.equal(addSource(i18n, 'hello', 'https://x.test/other/locales/'), false, 'a second folder is refused');
	assert.equal(addSource(i18n, 'Bad NS', MOD), false);
	assert.equal(addSource(i18n, 'x', 'https://x.test/no-slash'), false);
	assert.equal(addSource(i18n, 'x', 7), false);
	assert.equal(addSource({}, 'x', MOD), false, 'not an i18n instance');
});
