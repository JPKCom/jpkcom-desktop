/* JPKCom Desktop — calculator engine: input state, precedence, percent, number format — © Jean Pierre Kolb — MIT License

   Pure (no DOM, no Desk): the calculator window (index.js) and the unit
   tests (tests/p08-calc.test.mjs) both use it. No eval — an expression is a
   flat list of canonical number strings and operators ('12.5', '*', '-3'),
   evaluated point before line, left to right.

   Numbers are kept as canonical strings ("-12.5") with at most 12
   significant digits, which hides binary noise (0.1 + 0.2 → 0.3); they are
   shown per language only when drawn (formatNum with the language's
   formatters and decimal separator). */

/** Operators: key → shown glyph */
export const OPS = Object.freeze({ '+': '+', '-': '−', '*': '×', '/': '÷' });
export const isOp = t => typeof t === 'string' && Object.hasOwn(OPS, t);
/** Digits one number may have */
export const MAX_DIGITS = 15;
/** Calculations the history keeps */
export const HISTORY = 50;

/** Point before line: × and ÷ first, then + and − (left to right). parts: ['2', '+', '3', '*', '4'] */
export function compute(parts) {
	const nums = [Number(parts[0])];
	const ops = [];
	for (let i = 1; i < parts.length; i += 2) {
		const op = parts[i];
		const n = Number(parts[i + 1]);
		if (op === '*') nums[nums.length - 1] *= n;
		else if (op === '/') nums[nums.length - 1] /= n;
		else {
			ops.push(op);
			nums.push(n);
		}
	}
	let r = nums[0];
	ops.forEach((op, i) => { r = op === '+' ? r + nums[i + 1] : r - nums[i + 1]; });
	return r;
}

/** 12 significant digits; very large and very small values in exponent form ('1.5e+20') */
export function canonical(n) {
	const r = Number(Number(n).toPrecision(12));
	const a = Math.abs(r);
	if (a !== 0 && (a >= 1e15 || a < 1e-9)) return r.toExponential(8).replace(/\.?0+e/, 'e');
	return String(Object.is(r, -0) ? 0 : r);
}

/**
 * A canonical number string for display.
 *   fmt.int(n)  formats the integer part with the language's grouping (i18n.fmtNumber)
 *   fmt.sci(n)  formats exponent notation (i18n.fmtNumber(n, { notation: 'scientific', … }))
 *   fmt.decimal the language's decimal separator (i18n.decimalSep())
 *   fmt.digit(d) optional: one digit '0'–'9' in the language's digit system
 *               (i18n.fmtNumber(d)), so the fraction matches the integer part ('۱۲۳٫۴۵')
 * The minus is the typographic '−'; a typed trailing separator stays ('3,').
 */
export function formatNum(str, fmt) {
	const s = String(str);
	if (/e/i.test(s)) return fmt.sci(Number(s)).replace('-', '−');
	const neg = s.startsWith('-');
	const [int, frac] = s.replace('-', '').split('.');
	const digits = frac !== undefined && fmt.digit ? [...frac].map(d => fmt.digit(Number(d))).join('') : frac;
	return `${neg ? '−' : ''}${fmt.int(Number(int || '0'))}${frac !== undefined ? fmt.decimal + digits : ''}`;
}

/** An expression for display: '2 + 3 × 4' */
export const formatExpr = (parts, fmt) => parts.map(p => (isOp(p) ? OPS[p] : formatNum(p, fmt))).join(' ');

/** The last n entries of a list; n = 0 keeps none (slice(-0) would keep all) */
export const keepLast = (list, n) => (n > 0 ? list.slice(-n) : []);

/** Stored history { history: [{ e: '2 + 3', r: 5 }] } → cleaned (at most max), or null */
export function cleanCalc(v, max = HISTORY) {
	if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
	const history = Array.isArray(v.history)
		? v.history.filter(x => x && typeof x.e === 'string' && x.e.length <= 200 && /^[-+*/0-9.e ]+$/.test(x.e)
			&& typeof x.r === 'number' && Number.isFinite(x.r)).map(x => ({ e: x.e, r: x.r }))
		: [];
	return { history: keepLast(history, max) };
}

/**
 * The calculator's input state. press(key) with keys '0'–'9', '+', '-', '*',
 * '/', '=', 'dec', 'neg', 'percent', 'clear', 'back' → { result } after a
 * successful '=' (result: { e, r } for the history), else {}.
 * view() → { expr: parts | null, done: boolean (expr ends with '='),
 *            value: canonical string | null (null = error), clear: 'ac' | 'c', pending: op | null }
 */
export function createCalc() {
	let tokens = [];        // finished numbers and operators
	let entry = '';         // the number being typed
	let evaluated = null;   // after "=": the full expression shown above the result
	let error = false;

	const lastNumber = () => [...tokens].reverse().find(t => !isOp(t));
	const currentValue = () => entry || (evaluated ? null : lastNumber()) || '0';

	function reset() {
		tokens = [];
		entry = '';
		evaluated = null;
		error = false;
	}

	/* After "=", typing starts fresh; an operator continues with the result */
	function fromResult(keepValue) {
		if (!evaluated && !error) return;
		const v = error ? '' : entry;
		reset();
		if (keepValue) entry = v;
	}

	function digit(d) {
		fromResult(false);
		const count = entry.replace(/[-.]/g, '').length;
		if (entry === '0') entry = d;
		else if (entry === '-0') entry = `-${d}`;
		else if (count < MAX_DIGITS) entry += d;
	}

	function dot() {
		fromResult(false);
		if (!entry.includes('.')) entry = `${entry || '0'}.`;
	}

	function op(o) {
		if (error) return;
		fromResult(true);
		if (entry) {
			tokens.push(entry.replace(/\.$/, ''), o);
			entry = '';
		} else if (isOp(tokens.at(-1))) {
			tokens[tokens.length - 1] = o;
		} else {
			tokens.push('0', o);
		}
	}

	function neg() {
		fromResult(true);
		if (!entry) entry = '0';
		entry = entry.startsWith('-') ? entry.slice(1) : `-${entry}`;
	}

	/* With + or − pending, the percentage refers to the value so far
	   (200 + 10 % = 220); otherwise it is simply a hundredth */
	function percent() {
		fromResult(true);
		if (!entry) return;
		const last = tokens.at(-1);
		const base = last === '+' || last === '-' ? compute(tokens.slice(0, -1)) : 1;
		entry = canonical((base * Number(entry)) / 100);
	}

	function back() {
		if (evaluated || error) return;
		entry = entry.slice(0, -1);
		if (entry === '-') entry = '';
	}

	function clear() {
		if (entry && !evaluated) entry = '';
		else reset();
	}

	function equals() {
		if (error || evaluated) return null;
		const parts = entry ? [...tokens, entry.replace(/\.$/, '')] : tokens.slice(0, isOp(tokens.at(-1)) ? -1 : undefined);
		if (parts.length < 3) return null;
		const r = compute(parts);
		evaluated = parts;
		tokens = [];
		if (!Number.isFinite(r)) {
			error = true;
			entry = '';
			return null;
		}
		entry = canonical(r);
		return { e: parts.join(' '), r: Number(entry) };
	}

	const ACTIONS = { clear, neg, percent, dec: dot, back };

	return {
		press(k) {
			if (/^\d$/.test(k)) digit(k);
			else if (isOp(k)) op(k);
			else if (k === '=') {
				const result = equals();
				return result ? { result } : {};
			} else ACTIONS[k]?.();
			return {};
		},
		/** Starts over with a value (a calculation picked from the history) */
		load(value) {
			reset();
			entry = canonical(Number(value));
		},
		reset,
		view() {
			const clearKind = entry && !evaluated ? 'c' : 'ac';
			const pending = !entry && isOp(tokens.at(-1)) ? tokens.at(-1) : null;
			if (error) return { expr: evaluated, done: !!evaluated, value: null, clear: clearKind, pending };
			const expr = evaluated ?? (tokens.length ? (entry ? [...tokens, entry] : [...tokens]) : null);
			return { expr, done: !!evaluated, value: currentValue(), clear: clearKind, pending };
		},
		get error() { return error; }
	};
}
