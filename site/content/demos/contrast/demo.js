/* JPKCom Desktop — example web demo: contrast checker (WCAG 2) — © Jean Pierre Kolb — MIT License

   A tiny self-contained page for the showcase: external script and stylesheet
   only (the desktop's Content Security Policy allows no inline code), styles
   set through the CSSOM, every text taken from the page itself, so one script
   serves every language version (index.html, index.de.html, …). */

(() => {
	'use strict';

	const $ = id => document.getElementById(id);
	const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
	const lang = document.documentElement.lang || undefined;
	const fmt = new Intl.NumberFormat(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

	/* '#abc' / 'abc' / '#aabbcc' → '#aabbcc', or null */
	function normalize(v) {
		const m = HEX.exec(String(v).trim());
		if (!m) return null;
		const h = m[1].length === 3 ? [...m[1]].map(c => c + c).join('') : m[1];
		return `#${h.toLowerCase()}`;
	}

	/* Relative luminance (WCAG 2.x) */
	function luminance(hex) {
		const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
			.map(c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
		return 0.2126 * r + 0.7152 * g + 0.0722 * b;
	}

	const ratio = (a, b) => {
		const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
		return (hi + 0.05) / (lo + 0.05);
	};

	const pairs = ['fg', 'bg'].map(id => ({ color: $(id), text: $(`${id}-hex`) }));
	const sample = $('sample');
	const out = $('ratio');
	const checks = $('checks');

	function update() {
		const [fg, bg] = pairs.map(p => normalize(p.color.value));
		if (!fg || !bg) return;
		sample.style.setProperty('--fg', fg);
		sample.style.setProperty('--bg', bg);
		const r = ratio(fg, bg);
		/* WCAG rounds nothing: 4.499 fails 4.5 — show two decimals, truncated */
		out.textContent = out.dataset.format.replace('{ratio}', fmt.format(Math.floor(r * 100) / 100));
		for (const li of checks.querySelectorAll('li[data-min]')) {
			const ok = r >= Number(li.dataset.min);
			li.classList.toggle('is-pass', ok);
			li.classList.toggle('is-fail', !ok);
			li.querySelector('.state').textContent = ok ? checks.dataset.pass : checks.dataset.fail;
		}
	}

	for (const p of pairs) {
		p.color.addEventListener('input', () => {
			p.text.value = p.color.value;
			p.text.removeAttribute('aria-invalid');
			update();
		});
		p.text.addEventListener('input', () => {
			const v = normalize(p.text.value);
			p.text.setAttribute('aria-invalid', String(!v));
			if (!v) return;
			p.color.value = v;
			update();
		});
		p.text.addEventListener('blur', () => {
			p.text.value = p.color.value;
			p.text.removeAttribute('aria-invalid');
		});
	}

	$('swap').addEventListener('click', () => {
		const a = pairs[0].color.value;
		pairs[0].color.value = pairs[1].color.value;
		pairs[1].color.value = a;
		for (const p of pairs) p.text.value = p.color.value;
		update();
	});

	$('form').addEventListener('submit', e => e.preventDefault());
	update();
})();
