#!/usr/bin/env node
/* JPKCom Desktop — vault sealing tool: encrypts private bookmarks for the vault module — © Jean Pierre Kolb — MIT License

   Reads a plain-text JSON file of bookmarks (groups + items, the collection
   format of site/apps.js), asks for user name and password (the password
   hidden, twice) and writes <out>/<32 hex>.bin — name and key both come from
   the credentials and the deployment's salt and iterations (config.vault;
   src/modules/vault/vault-core.js, which this tool imports as it is, so the
   browser and the tool cannot drift apart).

   Usage
     node tools/seal-vault.mjs --in <file.json> [--out <dir>] [--keep | --prune]
                               [--config <site config>] [--manifest <site manifest>]
     node tools/seal-vault.mjs --list [--out <dir>] [--config …]   show the sealed files and their parameters
     node tools/seal-vault.mjs --new-salt                          print a random salt for config.vault.salt

     --in        the plain text — keep it OUTSIDE the web root: refused under site/, in the --out
                 folder, or anywhere below the web root --out belongs to (the project by default)
     --out       folder for the sealed file (default: config.vault.dir, relative to the project)
     --keep      keep the other .bin files in --out (one vault per user) without asking
     --prune     remove the other .bin files without asking (otherwise: asked on a terminal, kept in scripts)
     --config    the site configuration (default site/config.js): salt, iterations, dir, collection, tints
     --manifest  the site manifest (default config.site.data): ids the vault may not take

   DESKTOP_VAULT_USER / DESKTOP_VAULT_PASS replace the questions (CI, tests) — a
   password in the environment can end up in the shell history; prefer the prompt.
   Without a terminal, user name and password (twice) are read as lines from stdin.

   Format of the plain text (see site/vault/README.md):
     { "groups": [{ "id": "work", "name": { "en": "Work", "de": "Arbeit" }, "icon": "ti-briefcase", "tint": "blue" }],
       "items":  [{ "slug": "wiki", "group": "work", "name": "Wiki", "url": "https://wiki.example/", "desc": "…", "icon": "ti-book" }] }
   (The original desktop's { linkCategories, links: [{ cat }] } is read as well.)

   Zero dependencies (Node ≥ 24: WebCrypto is built in). */

import { readFileSync, writeFileSync, readdirSync, unlinkSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { randomBytes } from 'node:crypto';
import { dirname, join, relative, resolve, isAbsolute, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MIN_PASS = 12;

const core = await import(pathToFileURL(join(ROOT, 'src/modules/vault/vault-core.js')).href);
const { buildConfig } = await import(pathToFileURL(join(ROOT, 'src/core/config.js')).href);

/* ---------- Arguments ---------- */

const argv = process.argv.slice(2);
const opt = name => {
	const i = argv.indexOf(`--${name}`);
	if (i < 0) return null;
	const v = argv[i + 1];
	if (v === undefined || v.startsWith('--')) fail(`--${name} needs a value`);
	return v;
};
const flag = name => argv.includes(`--${name}`);
const show = p => (relative(process.cwd(), p) || '.').split(sep).join('/');

function fail(msg) {
	console.error(msg);
	process.exit(1);
}

const KNOWN = new Set(['in', 'out', 'keep', 'prune', 'config', 'manifest', 'list', 'new-salt', 'help']);
for (const a of argv) if (a.startsWith('--') && !KNOWN.has(a.slice(2))) fail(`Unknown option ${a} — see --help`);

if (flag('help') || !argv.length) {
	const head = readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].split('\n').slice(2);
	console.log(head.map(l => l.replace(/^ {3}/, '')).join('\n'));
	process.exit(argv.length ? 0 : 1);
}

if (flag('new-salt')) {
	console.log(randomBytes(24).toString('base64url'));
	console.error('Put it into site/config.js as vault: { salt: \'…\' } and seal every vault again (the file names change).');
	process.exit(0);
}

if (flag('keep') && flag('prune')) fail('--keep and --prune exclude each other');

/* ---------- Site configuration and manifest ---------- */

/* site/config.js is a classic script that sets window.DESKTOP_CONFIG: run it in a sandbox */
function siteConfig(file) {
	if (!existsSync(file)) fail(`${show(file)}: not found (--config)`);
	const sandbox = {};
	sandbox.window = sandbox;
	sandbox.self = sandbox;
	sandbox.globalThis = sandbox;
	try {
		vm.runInNewContext(readFileSync(file, 'utf8'), sandbox, { filename: file, timeout: 2000 });
	} catch (e) {
		fail(`${show(file)}: ${e.message}`);
	}
	/* objects of the sandbox realm → plain objects of this one (buildConfig checks the prototype) */
	let site = sandbox.DESKTOP_CONFIG;
	try {
		site = site === undefined ? undefined : structuredClone(site);
	} catch (e) {
		fail(`${show(file)}: window.DESKTOP_CONFIG cannot be read (${e.message})`);
	}
	const warnings = [];
	const config = buildConfig(site, msg => warnings.push(msg));
	for (const w of warnings) console.warn(`Config: ${w}`);
	const vault = core.cleanConfig(JSON.parse(JSON.stringify(config.vault)), msg => console.warn(`Config: config.vault.${msg}`));
	return { config, vault };
}

const CONFIG_FILE = resolve(opt('config') ?? join(ROOT, 'site/config.js'));
const { config, vault: VCFG } = siteConfig(CONFIG_FILE);
const PARAMS = { salt: VCFG.salt, iterations: VCFG.iterations };

const outArg = opt('out');
if (!outArg && VCFG.dir.startsWith('/')) fail(`config.vault.dir '${VCFG.dir}' is root-absolute — tell me the folder with --out`);
const OUT = resolve(outArg ?? join(ROOT, VCFG.dir));

function saltWarning() {
	if (VCFG.salt) return;
	console.warn(`\n!!! WARNING: ${core.EMPTY_SALT_WARNING}\n`);
}

/* ---------- --list ---------- */

if (flag('list')) {
	saltWarning();
	const files = existsSync(OUT) ? readdirSync(OUT).filter(f => f.endsWith('.bin')).sort() : [];
	if (!files.length) {
		console.log(`No sealed files in ${show(OUT)}`);
		process.exit(0);
	}
	for (const f of files) {
		const bytes = readFileSync(join(OUT, f));
		const head = core.readHeader(bytes);
		const state = !head ? 'not a vault file'
			: !core.sameParams(head, PARAMS) ? `version ${head.version}, ${head.iterations} iterations — OTHER salt or iterations than the config: cannot be opened`
				: `version ${head.version}, ${head.iterations} iterations — matches the config`;
		console.log(`${f}  ${bytes.length} bytes  ${state}`);
	}
	process.exit(0);
}

/* ---------- The plain text ---------- */

const inArg = opt('in');
if (!inArg) fail('--in <file.json> is missing (the plain-text bookmarks; see site/vault/README.md)');
const SOURCE = resolve(inArg);
const inside = (dir, file) => {
	const r = relative(dir, file);
	return r !== '' && !r.startsWith('..') && !isAbsolute(r);
};
/* The plain text must never lie where the web server publishes: below site/, in the --out folder,
   or anywhere below the web root that folder belongs to. That root is --out minus config.vault.dir
   when --out ends in it (the desktop served from the project root → the project itself); for any
   other --out the folder above it counts as published as well. */
function webRootOf(out) {
	const tail = VCFG.dir.split('/').filter(part => part && part !== '.');
	if (!tail.length) return { root: out, guessed: false };
	const parts = out.split(sep);
	if (parts.length > tail.length && parts.slice(-tail.length).every((part, i) => part === tail[i])) {
		return { root: parts.slice(0, -tail.length).join(sep) || sep, guessed: false };
	}
	return inside(ROOT, out) ? { root: ROOT, guessed: false } : { root: dirname(out), guessed: true };
}
const WEB = webRootOf(OUT);
const published = [join(ROOT, 'site'), OUT, WEB.root].find(dir => dir === SOURCE || inside(dir, SOURCE));
if (published) {
	const where = published === ROOT ? 'the project folder (the desktop is served from it)' : `${show(published)}/`;
	const how = published === WEB.root && WEB.guessed ? 'which the web server may publish' : 'which the web server publishes';
	fail(`${show(SOURCE)} lies inside ${where}, ${how} (sealed files go to ${show(OUT)}/) — move the plain text out of the web root, e.g. to ~/private/.`);
}
if (inside(ROOT, SOURCE)) console.warn(`Note: ${show(SOURCE)} lies inside the project — keep the plain text out of the repository and the web root.`);

let raw;
try {
	raw = JSON.parse(readFileSync(SOURCE, 'utf8'));
} catch (e) {
	fail(`${show(SOURCE)}: ${e.message}`);
}

/* Ids the manifest uses already in the target collection */
async function taken() {
	const file = resolve(opt('manifest') ?? join(ROOT, config.site.data));
	let data = {};
	if (existsSync(file)) {
		try {
			data = (await import(pathToFileURL(file).href)).default ?? {};
		} catch (e) {
			fail(`${show(file)}: ${e.message}`);
		}
	} else {
		console.warn(`Note: manifest ${show(file)} not found — ids are not checked against it`);
	}
	const col = (Array.isArray(data.collections) ? data.collections : []).find(c => c?.id === VCFG.collection);
	const prefix = typeof col?.prefix === 'string' ? col.prefix : col ? col.id : core.DEFAULT_PREFIX;
	const apps = [
		...(Array.isArray(data.apps) ? data.apps : []),
		...(Array.isArray(col?.items) ? col.items.filter(x => typeof x?.slug === 'string').map(x => ({ id: `${prefix}-${x.slug}` })) : [])
	];
	return core.takenIds(col ? { groups: Array.isArray(col.groups) ? col.groups : [] } : null, apps, prefix);
}

/* Icons: in the generated subset → fine; a real Tabler icon that is not in it yet → warning
   (site/icons.json + npm run icons); anything else → problem */
async function iconCheck() {
	const subset = new Set();
	try {
		for (const id of Object.keys((await import(pathToFileURL(join(ROOT, 'src/icons/tabler.js')).href)).default)) subset.add(id);
	} catch { /* not generated yet */ }
	try {
		for (const id of Object.keys((await import(pathToFileURL(join(ROOT, 'src/icons/custom.js')).href)).symbols)) subset.add(id);
	} catch { /* ignore */ }
	let extra = [];
	try {
		const v = JSON.parse(readFileSync(join(ROOT, 'site/icons.json'), 'utf8'));
		if (Array.isArray(v)) extra = v.filter(x => typeof x === 'string');
	} catch { /* optional */ }
	const tabler = join(ROOT, 'node_modules/@tabler/icons/icons');
	const canVerify = existsSync(tabler);
	const missing = new Set();
	const unverified = new Set();
	const known = id => {
		if (subset.has(id)) return true;
		const m = /^(tif?)-([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(id);
		if (!m) return false;
		if (!canVerify) {
			unverified.add(id);
			return true;
		}
		if (!existsSync(join(tabler, m[1] === 'tif' ? 'filled' : 'outline', `${m[2]}.svg`))) return false;
		missing.add(id);
		return true;
	};
	return { known, missing, unverified, extra: new Set(extra) };
}

const icons = await iconCheck();
const tintNames = new Set(Object.keys(config.theme.tints ?? {}));
const content = core.clean(raw, { taken: await taken(), icons: icons.known, tints: n => tintNames.has(n) });
if (content.problems.length) fail(['Not sealed:', ...content.problems.map(p => `  - ${p}`)].join('\n'));
const { groups, items } = content;

if (icons.missing.size) {
	const ids = [...icons.missing].sort();
	const listed = ids.filter(id => icons.extra.has(id));
	const notListed = ids.filter(id => !icons.extra.has(id));
	if (notListed.length) {
		console.warn(`Icons not in src/icons/tabler.js yet: ${notListed.join(', ')}\n  Add them to site/icons.json (a JSON array of ids), then run npm run icons — until then the desktop shows the group's icon (or ti-bookmark) instead.`);
	}
	if (listed.length) console.warn(`Icons listed in site/icons.json but not built yet: ${listed.join(', ')} — run npm run icons.`);
}
if (icons.unverified.size) console.warn(`Could not verify icons (node_modules/@tabler/icons missing): ${[...icons.unverified].join(', ')}`);

/* ---------- Questions ---------- */

const tty = process.stdin.isTTY === true;
let pipedLines = null;

/* Without a terminal: the answers are the next lines of stdin */
async function nextLine() {
	pipedLines ??= createInterface({ input: process.stdin, terminal: false })[Symbol.asyncIterator]();
	const r = await pipedLines.next();
	return r.done ? null : r.value;
}

function askVisible(question) {
	if (!tty) {
		process.stderr.write(question);
		return nextLine().then(v => {
			process.stderr.write('\n');
			return v;
		});
	}
	return new Promise(done => {
		const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
		rl.on('SIGINT', () => {
			rl.close();
			process.stdout.write('\n');
			process.exit(130);
		});
		rl.question(question, answer => {
			rl.close();
			done(answer);
		});
	});
}

/* Hidden input in raw mode: nothing is echoed, not even dots */
function askHidden(question) {
	if (!tty) return askVisible(question);
	return new Promise(done => {
		const input = process.stdin;
		let value = '';
		process.stdout.write(question);
		input.setEncoding('utf8');
		input.setRawMode(true);
		input.resume();
		const finish = () => {
			input.setRawMode(false);
			input.pause();
			input.removeListener('data', onData);
			process.stdout.write('\n');
		};
		function onData(chunk) {
			if (chunk.startsWith('\u001b')) return;            // arrow keys and other escape sequences
			for (const ch of chunk) {
				if (ch === '\r' || ch === '\n') {
					finish();
					done(value);
					return;
				}
				if (ch === '\u0003') {                          // Ctrl+C
					finish();
					process.exit(130);
				}
				if (ch === '\u0004') {                          // Ctrl+D
					if (value) continue;
					finish();
					done('');
					return;
				}
				if (ch === '\u007f' || ch === '\b') value = [...value].slice(0, -1).join('');
				else if (ch === '\u0015') value = '';           // Ctrl+U
				else if (ch >= ' ') value += ch;
			}
		}
		input.on('data', onData);
	});
}

const confirm = async question => /^\s*(y|yes)\s*$/i.test((await askVisible(`${question} [y/N] `)) ?? '');

/* ---------- Seal ---------- */

saltWarning();
const envUser = process.env.DESKTOP_VAULT_USER;
const envPass = process.env.DESKTOP_VAULT_PASS;
const user = envUser ?? await askVisible('User name: ');
const pass = envPass ?? await askHidden('Password: ');
if (!user?.trim() || !pass) fail('User name and password must not be empty.');
if (envPass == null && (await askHidden('Repeat password: ')) !== pass) fail('The passwords do not match.');
if (pass.length < MIN_PASS) console.warn(`Note: the password has only ${pass.length} characters — ${MIN_PASS} or more make guessing hopeless.`);

const { key, file } = await core.derive(user, pass, { ...PARAMS, usages: ['encrypt', 'decrypt'] });
const payload = { groups, items };
const sealed = await core.seal(key, payload, PARAMS);

/* Round trip before anything is written */
const back = await core.open(key, sealed, PARAMS);
if (JSON.stringify(back) !== JSON.stringify(payload)) fail('Round trip failed — nothing written.');
if (sealed.length > VCFG.maxBytes) fail(`The sealed file has ${sealed.length} bytes, more than config.vault.maxBytes (${VCFG.maxBytes}) — nothing written.`);

mkdirSync(OUT, { recursive: true });
if (!statSync(OUT).isDirectory()) fail(`${show(OUT)} is not a folder`);
const name = core.fileName(file);
const target = join(OUT, name);
const replaced = existsSync(target);
writeFileSync(target, sealed);

console.log(`${groups.length} group(s), ${items.length} bookmark(s) → ${show(target)} (${sealed.length} bytes${replaced ? ', replaced' : ''})`);

/* Other users' files stay unless asked */
const others = readdirSync(OUT).filter(f => f.endsWith('.bin') && f !== name).sort();
if (others.length) {
	let remove = false;
	if (flag('prune')) remove = true;
	else if (!flag('keep') && tty && envPass == null) {
		console.log(`Other sealed files in ${show(OUT)} (other users or old credentials):\n  ${others.join('\n  ')}`);
		remove = await confirm('Remove them?');
	}
	if (remove) {
		for (const f of others) unlinkSync(join(OUT, f));
		console.log(`Removed: ${others.join(', ')} — delete them on the server as well.`);
	} else {
		console.log(`Kept ${others.length} other sealed file(s) in ${show(OUT)} (--prune removes them).`);
	}
}

console.log(`Deploy: upload ${name} to ${VCFG.dir} on the server (no directory listing, Cache-Control: no-cache). Never commit .bin files.`);
console.log('Unlock: type login in the terminal of the desktop.');
