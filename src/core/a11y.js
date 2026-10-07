/* JPKCom Desktop — accessibility helpers: shared live regions — © Jean Pierre Kolb — MIT License

   One polite (role=status) and one assertive (role=alert) live region for the
   whole desktop, created on first use. Short status messages only ("Window
   overview: 3 windows", "Copied") — content that should stay readable belongs
   into the visible UI. */

const regions = {};

/* Plain DOM calls (no dom.js import: dom.js imports announce() from here) */
function region(kind) {
	if (!regions[kind]?.isConnected) {
		const el = document.createElement('div');
		el.className = 'visually-hidden';
		el.setAttribute('role', kind === 'assertive' ? 'alert' : 'status');
		regions[kind] = el;
		document.body.append(el);
	}
	return regions[kind];
}

/**
 * Speaks text to screen readers. The region is emptied first and filled a
 * moment later, so the same message twice in a row is announced twice.
 */
export function announce(text, { assertive = false } = {}) {
	if (typeof document === 'undefined' || !text) return;
	const el = region(assertive ? 'assertive' : 'polite');
	el.textContent = '';
	setTimeout(() => { el.textContent = String(text); }, 60);
}
