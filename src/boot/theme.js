/* JPKCom Desktop — theme, accent and site colours before the first paint — © Jean Pierre Kolb — MIT License

   A classic script in <head>, right after site/config.js and the core CSS:
   the CSP allows no inline script, and a module would run too late — a
   reload in the light theme must never flash dark. It only reads
   window.DESKTOP_CONFIG, localStorage ('<namespace>-theme', '-accent',
   '-wallpaper') and sessionStorage ('<namespace>-booted');
   the settings panel owns these values afterwards and follows the system
   while "auto" is chosen.

   Sets on <html>:
     data-theme      'dark' | 'light'  (resolved; 'auto' follows prefers-color-scheme)
     data-wc         'left' | 'right'  window controls side
     data-wc-style   'classic' | 'minimal'
     --accent, --on-accent             the chosen accent and the text colour on it
     --accent-<id>, --t-<id>           accents and tints added or changed in the config
     --wallpaper-from, --wallpaper-to  the stored colour/gradient wallpaper, else the default
                                       one (body background until the panels paint #wallpaper)
     data-wp-dir     'glow' | 'down' | 'diag' | 'radial'  its gradient direction (base.css)
     data-wp-tone    'light' | 'dark'  how bright the wallpaper is under the menu bar — 'light'
                     gives the bar a darker glass (tokens.css). Rule (the wallpaper panel applies
                     the same one when the wallpaper changes): a colour is light when its relative
                     luminance is above 0.4; a gradient when its top colour (from) or the mean of
                     both is; an image or motif when its config entry says tone: 'light'
     --anim          config.ui.animMs — window transitions use it from the first frame
     data-boot       'pending' while the boot screen will come (a plain cover until the
                     power module of the shell shows the real one; main.js removes it otherwise)

   And in <head>: meta theme-color = brand.themeColor, apple-mobile-web-app-title =
   brand.shortName (the static values in index.html cover pages without JavaScript).

   Built-in accent ids must match src/css/tokens.css and src/core/config.js. */

(() => {
	try {
		const cfg = window.DESKTOP_CONFIG && typeof window.DESKTOP_CONFIG === 'object' ? window.DESKTOP_CONFIG : {};
		const theme = cfg.theme && typeof cfg.theme === 'object' ? cfg.theme : {};
		const ns = typeof cfg.namespace === 'string' && /^[a-z][a-z0-9-]{0,23}$/.test(cfg.namespace) ? cfg.namespace : 'jpkdesk';
		const root = document.documentElement;
		const HEX = /^#[0-9a-f]{6}$/i;
		const ID = /^[a-z][a-z0-9-]{0,31}$/;
		const read = k => {
			try {
				return localStorage.getItem(`${ns}-${k}`);
			} catch {
				return null;
			}
		};

		/* The text colour on an accent: white or black, whichever contrasts more
		   (the same rule as onAccent() in src/panels/pure.js) */
		const luminance = hex => {
			const lin = c => {
				const x = parseInt(c, 16) / 255;
				return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
			};
			return 0.2126 * lin(hex.slice(1, 3)) + 0.7152 * lin(hex.slice(3, 5)) + 0.0722 * lin(hex.slice(5, 7));
		};
		const onAccent = hex => {
			const lum = luminance(hex);
			return 1.05 / (lum + 0.05) >= (lum + 0.05) / 0.05 ? '#fff' : '#000';
		};

		/* Site colours: accents and tints added or changed in the config */
		const accents = new Set(['blue', 'violet', 'pink', 'orange', 'green', 'teal', 'graphite']);
		const siteHex = new Map(); // accent id → its hex from the config
		for (const [id, v] of Object.entries(theme.accents && typeof theme.accents === 'object' ? theme.accents : {})) {
			if (!ID.test(id)) continue;
			if (v === null) accents.delete(id);
			else if (HEX.test(v)) {
				root.style.setProperty(`--accent-${id}`, v);
				accents.add(id);
				siteHex.set(id, v);
			}
		}
		for (const [id, v] of Object.entries(theme.tints && typeof theme.tints === 'object' ? theme.tints : {})) {
			if (ID.test(id) && Array.isArray(v) && v.length === 2 && HEX.test(v[0]) && HEX.test(v[1])) {
				root.style.setProperty(`--t-${id}`, `${v[0]}, ${v[1]}`);
			}
		}

		/* Theme: stored choice, else the configured default */
		const MODES = ['dark', 'light', 'auto'];
		const stored = read('theme');
		const mode = MODES.includes(stored) ? stored : MODES.includes(theme.default) ? theme.default : 'dark';
		const light = mode === 'light' || (mode === 'auto' && matchMedia('(prefers-color-scheme: light)').matches);
		root.dataset.theme = light ? 'light' : 'dark';

		/* Accent: a known id or (if allowed) a custom #rrggbb with a readable text colour on it */
		const custom = theme.allowCustomAccent !== false;
		const valid = v => (typeof v === 'string' && accents.has(v)) || (custom && HEX.test(v ?? ''));
		const pick = [read('accent'), theme.accent, 'blue'].find(valid) ?? 'blue';
		if (HEX.test(pick)) {
			root.style.setProperty('--accent', pick);
			root.style.setProperty('--on-accent', onAccent(pick));
		} else {
			if (pick !== 'blue') root.style.setProperty('--accent', `var(--accent-${pick})`);
			/* a site accent may need black text; built-in accents keep the token default (white) */
			if (siteHex.has(pick)) root.style.setProperty('--on-accent', onAccent(siteHex.get(pick)));
		}

		/* Window controls */
		const wc = theme.windowControls && typeof theme.windowControls === 'object' ? theme.windowControls : {};
		root.dataset.wc = wc.side === 'right' ? 'right' : 'left';
		root.dataset.wcStyle = wc.style === 'minimal' ? 'minimal' : 'classic';

		/* Wallpaper as the page background until the panels paint #wallpaper: a stored colour or
		   gradient (motifs and images only exist once their module runs), else the default */
		const DIRS = ['glow', 'down', 'diag', 'radial'];
		let mine = null;
		try {
			mine = JSON.parse(read('wallpaper') ?? 'null');
		} catch {
			mine = null;
		}
		const ownGradient = mine && typeof mine === 'object' && mine.type === 'gradient'
			&& HEX.test(mine.from ?? '') && HEX.test(mine.to ?? '') && DIRS.includes(mine.dir);
		const ownColor = mine && typeof mine === 'object' && mine.type === 'color' && HEX.test(mine.color ?? '');
		const wpCfg = cfg.wallpaper && typeof cfg.wallpaper === 'object' ? cfg.wallpaper : {};
		const wp = ownGradient || ownColor ? mine : wpCfg.default;
		const LIGHT = 0.4;
		let tone = 'dark';
		if (wp && wp.type === 'gradient' && HEX.test(wp.from) && HEX.test(wp.to)) {
			root.style.setProperty('--wallpaper-from', wp.from);
			root.style.setProperty('--wallpaper-to', wp.to);
			if (DIRS.includes(wp.dir)) root.dataset.wpDir = wp.dir;
			const top = luminance(wp.from);
			if (top > LIGHT || (top + luminance(wp.to)) / 2 > LIGHT) tone = 'light';
		} else if (wp && wp.type === 'color' && HEX.test(wp.color)) {
			root.style.setProperty('--wallpaper-from', wp.color);
			root.style.setProperty('--wallpaper-to', wp.color);
			if (luminance(wp.color) > LIGHT) tone = 'light';
		}
		/* An image or motif (stored or the default): its config entry may say tone: 'light' */
		const shown = mine && typeof mine === 'object' && (mine.type === 'image' || mine.type === 'svg') ? mine : wp;
		const kind = shown && typeof shown === 'object' ? { image: 'images', svg: 'motifs' }[shown.type] : null;
		if (kind) {
			const entry = Array.isArray(wpCfg[kind]) ? wpCfg[kind].find(e => e && typeof e === 'object' && e.id === shown.id) : null;
			tone = entry?.tone === 'light' ? 'light' : 'dark';
		}
		root.dataset.wpTone = tone;

		/* Motion: the duration of window transitions (tokens.css: --dur follows --anim) */
		const ui = cfg.ui && typeof cfg.ui === 'object' ? cfg.ui : {};
		if (Number.isInteger(ui.animMs) && ui.animMs >= 0) root.style.setProperty('--anim', `${ui.animMs}ms`);

		/* Boot screen once per browser session: cover the page until it is shown (no empty desktop flash) */
		const boot = cfg.boot && typeof cfg.boot === 'object' ? cfg.boot : {};
		let booted = null;
		try {
			booted = sessionStorage.getItem(`${ns}-booted`);
		} catch { /* no session storage: no boot screen either */
			booted = '1';
		}
		if (boot.enabled !== false && !booted && !matchMedia('(prefers-reduced-motion: reduce)').matches) root.dataset.boot = 'pending';

		/* Browser UI colour and the home-screen name (Safari reads it when the page is added) */
		const brand = cfg.brand && typeof cfg.brand === 'object' ? cfg.brand : {};
		if (HEX.test(brand.themeColor ?? '')) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', brand.themeColor);
		if (typeof brand.shortName === 'string' && brand.shortName.trim() && brand.shortName.length <= 40) {
			document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute('content', brand.shortName.trim());
		}
	} catch {
		/* storage or config unavailable: the CSS defaults apply */
	}
})();
