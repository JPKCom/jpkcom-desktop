/* JPKCom Desktop — vault strings: English (reference locale) — © Jean Pierre Kolb — MIT License

   Namespace 'vault' (src/modules/vault): the terminal commands login and logout,
   the collection the vault creates when the site has none, the reset row.
   {user}: the user name as typed (normalised). keep: the question takes the
   answers of _meta.js `yes`; "[y/N]" shows that no is the default. */
export default {
	collection: 'Bookmarks',
	user: 'login:',
	pass: 'Password:',
	check: 'Checking …',
	noArgs: 'login takes no arguments — they were ignored and not stored.',
	denied: 'Login incorrect.',
	offline: 'login: server cannot be reached — try again later.',
	unsupported: 'login: this browser cannot decrypt here.',
	ok: 'Logged in as {user}. New in the bookmarks:',
	keep: 'Stay logged in on this device? [y/N]',
	kept: 'You stay logged in until you type logout.',
	keepFail: 'Could not be stored — login again on your next visit.',
	loggedOut: 'Logged out. The private bookmarks are hidden.',
	notLoggedIn: 'logout: not logged in',
	cmdLogin: 'unlock the private bookmarks',
	cmdLogout: 'hide the private bookmarks again',
	resetLabel: 'Private bookmarks',
	resetHint: 'Logs out and forgets a login kept on this device.'
};
