/* JPKCom Desktop — menu bar fit: the app name gives way first, then the clock's date — © Jean Pierre Kolb — MIT License

   When the menus and the status area (search, weather, language, clock) do
   not fit, the app name shrinks first (ellipsis, menubar.css); once it would
   get narrower than MIN_APP, the clock drops its date (body.mb-tight).
   Measured, so it holds for every width, language and app name — and always
   decided from the roomy state, so the result cannot flip back and forth. */

const MIN_APP = 110;

export function initMenubarFit() {
	const bar = document.getElementById('menubar');
	const menus = document.getElementById('mb-menus');
	const status = document.getElementById('mb-status');
	if (!bar || !menus) return null;
	let queued = false;

	function check() {
		queued = false;
		const app = menus.querySelector('.mb-app');
		document.body.classList.remove('mb-tight');
		if (!app) return;
		const cut = () => app.scrollWidth > app.clientWidth + 1;
		if (cut() && app.clientWidth < MIN_APP) document.body.classList.add('mb-tight');
		/* A shortened name shows in full as a tooltip */
		if (cut()) app.title = app.textContent;
		else app.removeAttribute('title');
	}

	function queue() {
		if (queued) return;
		queued = true;
		requestAnimationFrame(check);
	}

	const resize = new ResizeObserver(queue);
	resize.observe(bar);
	if (status) {
		resize.observe(status);
		/* Status items come and go (search, weather) and change their text (clock, language) */
		new MutationObserver(queue).observe(status, { childList: true, subtree: true, characterData: true });
	}
	new MutationObserver(queue).observe(menus, { childList: true, subtree: true, characterData: true });
	queue();
	return Object.freeze({ queue });
}
