# Seiten schreiben

Schlichte HTML-Dateien, ein Ordner pro Sprache. Der Reader zeigt sie im Fenster an — ohne iframe, ohne Skripte.

## Das Markup

Der Inhalt ist das erste `main article`, `article` oder `main` der Datei, der Titel seine `h1`, der Vorspann ein Absatz mit der Klasse `lead` (die Regeln in `config.reader.rules`).

```
<main><article>
  <h1>Seitentitel</h1>
  <p class="lead">Ein, zwei Sätze über die Seite.</p>
  <h2 id="teil">Ein Abschnitt</h2>
</article></main>
```

## Worauf zu achten ist

- **Titel**: Das Fenster zeigt den Teil von `<title>` vor „ | “, sonst die `h1`.
- **Sprachen**: `<html lang>` legt die Sprache fest; `<link rel="alternate" hreflang>` nennt die Seite nach einem Sprachwechsel.
- **Links**: Relative Links öffnen sich im selben Fenster, andere Websites in einem neuen Tab.
- **Entfernt**: Skripte, Styles, Formulare, iframes und Event-Handler.

## Diese Handbuchseite

Dieser Text ist das `man` des Eintrags in `site/apps.js` — eine Markdown-Datei pro Sprache, die das Terminal mit `man writing-pages` ausgibt. Die ganze Seite öffnet sich im Katalog oder mit `open writing-pages`.
