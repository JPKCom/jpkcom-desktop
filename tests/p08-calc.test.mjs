/* JPKCom Desktop — tests: calculator engine (precedence, percent, canonical numbers, input state, history) — © Jean Pierre Kolb — MIT License */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compute, canonical, formatNum, formatExpr, cleanCalc, createCalc, isOp, keepLast, HISTORY, MAX_DIGITS } from '../src/apps/calc/engine.js';

/* Presses a sequence of keys: '12+3*4=' (digits, operators, '='); words for the rest */
function run(keys, calc = createCalc()) {
	let last = {};
	for (const k of Array.isArray(keys) ? keys : keys.split('')) last = calc.press(k);
	return { calc, view: calc.view(), last };
}

const DE = { int: n => new Intl.NumberFormat('de-DE').format(n), sci: n => new Intl.NumberFormat('de-DE', { notation: 'scientific', maximumFractionDigits: 8 }).format(n), decimal: ',' };
const EN = { int: n => new Intl.NumberFormat('en-GB').format(n), sci: n => new Intl.NumberFormat('en-GB', { notation: 'scientific', maximumFractionDigits: 8 }).format(n), decimal: '.' };

test('compute: point before line, left to right', () => {
	assert.equal(compute(['2', '+', '3', '*', '4']), 14);
	assert.equal(compute(['10', '-', '4', '-', '3']), 3);
	assert.equal(compute(['8', '/', '2', '*', '3']), 12);
	assert.equal(compute(['1', '-', '6', '/', '3', '+', '2']), 1);
	assert.equal(compute(['5']), 5);
	assert.equal(compute(['1', '/', '0']), Infinity);
});

test('canonical: 12 significant digits, exponent form at the extremes', () => {
	assert.equal(canonical(0.1 + 0.2), '0.3');
	assert.equal(canonical(1 / 3), '0.333333333333');
	assert.equal(canonical(-0), '0');
	assert.equal(canonical(123456789012345678), '1.23456789e+17');
	assert.equal(canonical(1e-12), '1e-12');
	assert.equal(canonical(2.5e20), '2.5e+20');
});

test('formatNum / formatExpr: separators per language, typographic minus, typed separator kept', () => {
	assert.equal(formatNum('-12345.5', DE), '−12.345,5');
	assert.equal(formatNum('-12345.5', EN), '−12,345.5');
	assert.equal(formatNum('3.', DE), '3,');
	assert.equal(formatNum('0', EN), '0');
	assert.match(formatNum('1.5e+20', EN), /^1\.5E20$/);
	assert.equal(formatExpr(['2', '*', '-3', '/', '4'], EN), '2 × −3 ÷ 4');
	assert.equal(isOp('*'), true);
	assert.equal(isOp('x'), false);
});

test('formatNum: the fraction uses the language\'s digits as well', () => {
	const nf = new Intl.NumberFormat('ar-EG');
	const AR = { int: n => nf.format(n), sci: n => nf.format(n), decimal: '٫', digit: d => new Intl.NumberFormat('ar-EG', { useGrouping: false }).format(d) };
	const out = formatNum('123.45', AR);
	assert.equal(out, nf.format(123.45));
	assert.doesNotMatch(out, /[0-9]/);
	assert.equal(formatNum('3.', AR), `${nf.format(3)}٫`);
	/* Without fmt.digit the fraction stays as typed */
	assert.equal(formatNum('1.25', EN), '1.25');
});

test('input: precedence, binary noise, chained operators', () => {
	assert.equal(run('2+3*4=').view.value, '14');
	assert.equal(run(['0', 'dec', '1', '+', '0', 'dec', '2', '=']).view.value, '0.3');
	assert.equal(run(['1', 'dec', '5', '*', '2', '=']).view.value, '3');
	/* A second operator replaces the first */
	assert.equal(run('6+*2=').view.value, '12');
	/* An operator first starts from 0 */
	assert.equal(run('-5=').view.value, '-5');
	/* After '=', an operator continues with the result, a digit starts fresh */
	assert.equal(run('2+3=*2=').view.value, '10');
	assert.equal(run('2+3=7').view.value, '7');
});

test('input: percent relative to the running value with + and −, else a hundredth', () => {
	assert.equal(run(['2', '0', '0', '+', '1', '0', 'percent', '=']).view.value, '220');
	assert.equal(run(['2', '0', '0', '-', '2', '5', 'percent', '=']).view.value, '150');
	assert.equal(run(['5', '0', '*', '1', '0', 'percent', '=']).view.value, '5');
	assert.equal(run(['5', 'percent']).view.value, '0.05');
});

test('input: sign, decimal point, backspace, clear', () => {
	assert.equal(run(['5', 'neg']).view.value, '-5');
	assert.equal(run(['neg', '3']).view.value, '-3');
	assert.equal(run(['dec', '5']).view.value, '0.5');
	assert.equal(run(['1', 'dec', 'dec', '2']).view.value, '1.2');
	assert.equal(run(['1', '2', '3', 'back']).view.value, '12');
	assert.equal(run(['neg', '3', 'back']).view.value, '0');
	const { calc, view } = run(['1', '2', '+', '3']);
	assert.equal(view.clear, 'c');
	calc.press('clear');
	assert.equal(calc.view().value, '12');
	assert.equal(calc.view().clear, 'ac');
	calc.press('clear');
	assert.equal(calc.view().value, '0');
	assert.equal(calc.view().expr, null);
});

test('input: at most MAX_DIGITS digits, leading zero replaced', () => {
	const { view } = run('9'.repeat(MAX_DIGITS + 5));
	assert.equal(view.value.length, MAX_DIGITS);
	assert.equal(run('007').view.value, '7');
});

test('input: division by zero is an error; the next digit starts over, an operator is ignored', () => {
	const { calc, view } = run('1/0=');
	assert.equal(view.value, null);
	assert.equal(calc.error, true);
	assert.deepEqual(view.expr, ['1', '/', '0']);
	calc.press('+');
	assert.equal(calc.view().value, null);
	calc.press('4');
	assert.equal(calc.view().value, '4');
	assert.equal(calc.error, false);
});

test('equals: history record, nothing without a full expression, pending operator dropped', () => {
	assert.deepEqual(run('2+3=').last, { result: { e: '2 + 3', r: 5 } });
	assert.deepEqual(run('2=').last, {});
	assert.deepEqual(run('2+3+=').last, { result: { e: '2 + 3', r: 5 } });
	/* '=' twice adds nothing */
	const { calc } = run('2+3=');
	assert.deepEqual(calc.press('='), {});
});

test('view: expression while typing, pending operator, after equals', () => {
	assert.deepEqual(run('2+').view, { expr: ['2', '+'], done: false, value: '2', clear: 'ac', pending: '+' });
	assert.deepEqual(run('2+3').view.expr, ['2', '+', '3']);
	const after = run('2+3=').view;
	assert.equal(after.done, true);
	assert.deepEqual(after.expr, ['2', '+', '3']);
});

test('load: a value from the history starts a new calculation', () => {
	const calc = createCalc();
	calc.press('9');
	calc.press('+');
	calc.load(0.1 + 0.2);
	assert.equal(calc.view().value, '0.3');
	assert.equal(calc.view().expr, null);
});

test('cleanCalc: validates entries, keeps the newest max, rejects non-objects', () => {
	assert.equal(cleanCalc(null), null);
	assert.equal(cleanCalc([]), null);
	assert.deepEqual(cleanCalc({}), { history: [] });
	const v = cleanCalc({ history: [
		{ e: '2 + 3', r: 5 },
		{ e: 'alert(1)', r: 1 },
		{ e: '1 / 0', r: Infinity },
		{ e: '1.5e+20 * 2', r: 3e20, extra: 'x' },
		null,
		{ e: 'x'.repeat(201), r: 1 }
	] });
	assert.deepEqual(v, { history: [{ e: '2 + 3', r: 5 }, { e: '1.5e+20 * 2', r: 3e20 }] });
	const many = { history: Array.from({ length: 80 }, (_, i) => ({ e: `${i} + 1`, r: i + 1 })) };
	assert.equal(cleanCalc(many).history.length, HISTORY);
	assert.equal(cleanCalc(many).history[0].r, 31);
	assert.equal(cleanCalc(many, 5).history.length, 5);
	/* historySize 0 keeps nothing (slice(-0) would have kept everything) */
	assert.deepEqual(cleanCalc(many, 0), { history: [] });
});

test('keepLast: the newest n, none for n = 0', () => {
	assert.deepEqual(keepLast([1, 2, 3], 2), [2, 3]);
	assert.deepEqual(keepLast([1, 2, 3], 5), [1, 2, 3]);
	assert.deepEqual(keepLast([1, 2, 3], 0), []);
});
