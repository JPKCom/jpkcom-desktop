#!/usr/bin/env node
/* JPKCom Desktop — PWA icon rasteriser (assets/icons/*.svg → PNG) — © Jean Pierre Kolb — MIT License

   Makes the committed PNG icons of the web app manifest reproducible: renders
   the SVG sources in headless Chromium (playwright-core, devDependency;
   browsers: `npm run browsers`) and writes

     favicon.svg   → icon-192.png, icon-512.png            (purpose "any")
     maskable.svg  → maskable-192.png, maskable-512.png    (purpose "maskable")
                     apple-touch-icon.png (180 px, full bleed like maskable)

   Usage
     node tools/build-pwa-icons.mjs

   Run it after a change to favicon.svg or maskable.svg and commit the PNGs. */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../assets/icons/');

const JOBS = [
	['favicon.svg', 192, 'icon-192.png'],
	['favicon.svg', 512, 'icon-512.png'],
	['maskable.svg', 192, 'maskable-192.png'],
	['maskable.svg', 512, 'maskable-512.png'],
	['maskable.svg', 180, 'apple-touch-icon.png']
];

let chromium;
try {
	({ chromium } = await import('playwright-core'));
} catch {
	console.error('playwright-core is missing: npm ci (devDependency), then npm run browsers');
	process.exit(2);
}

const browser = await chromium.launch({ headless: true });
try {
	const page = await browser.newPage();
	for (const [src, size, out] of JOBS) {
		/* The sources carry a viewBox only: the size comes in as width/height on the root */
		const svg = readFileSync(join(DIR, src), 'utf8').replace(/<svg\b(?![^>]*\bwidth=)/, `<svg width="${size}" height="${size}"`);
		await page.setViewportSize({ width: size, height: size });
		await page.setContent(`<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block}</style>${svg}`);
		writeFileSync(join(DIR, out), await page.locator('svg').screenshot({ omitBackground: true }));
		console.log(`  ${out}  ${size}×${size}`);
	}
} finally {
	await browser.close();
}
