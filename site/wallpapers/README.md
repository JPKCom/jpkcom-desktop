# Picture wallpapers

> JPKCom Desktop — site folder for picture wallpapers — © Jean Pierre Kolb — MIT License

Put your own pictures for the wallpaper panel here. Nothing is shipped: the desktop draws its
motifs, gradients and colours itself, so this folder starts empty.

1. Copy the picture into this folder — WebP or AVIF keep it small; 2560 × 1600 pixels is plenty
   for most screens. Use only pictures you may publish, and name the photographer where the
   licence asks for it.
2. List it in `site/config.js` under `wallpaper.images`:

   ```js
   wallpaper: {
   	images: [
   		{ id: 'harbour', src: 'site/wallpapers/harbour.webp',
   			name: { en: 'Harbour at dusk', de: 'Hafen in der Dämmerung' },
   			credit: 'Photo: Jane Doe, CC BY 4.0' }
   	]
   }
   ```

   - `id`: `[a-z0-9-]`, unique — it is what the visitor's choice is stored as.
   - `src`: a path relative to the desktop's folder (same origin; the Content Security Policy
     allows images from `'self'`).
   - `name`: a text or a language map with a value for every configured language.
   - `credit`: optional, shown with the picture in the wallpaper panel.
3. To make it the default: `wallpaper.default: { type: 'image', id: 'harbour' }`.

Invalid entries are reported in the browser console and left out — they never break the panel.
