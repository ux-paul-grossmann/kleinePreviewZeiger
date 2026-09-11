# AGENTS.md

## Stack
- Chrome Extension MV3, vanilla JS/CSS/HTML — kein Bundler, kein `package.json`, keine Dependencies, keine Build-/Test-/Lint-Toolchain.
- `manifest.json:6-15` — `permissions: ["storage"]`, `action.default_popup: popup.html`, `content_scripts` nur für `https://www.kleinanzeigen.de/*` (`content.js` + `styles.css`).
- `content.js:1` — IIFE; Hover-Preview auf `li.relative.mb-xsmall` (`content.js:361`), Fetch + `DOMParser` der Anzeigenseite, Cache via `Map` (`content.js:2`), Injektion von `#kb-preview-card` (`content.js:32`). `MutationObserver` für dynamisch nachgeladene Ads (`content.js:406`).
- `styles.css:1` — Material-3-Tokens via CSS-Variablen; Light = `:root`, Dark = `:root:not([data-kb-theme="light"])` + explizit `:root[data-kb-theme="dark"]`. Theme-Umschaltung über `document.documentElement[data-kb-theme]` (`content.js:9`).
- `popup.html`/`popup.js` + `content.js:18-29` — `chrome.storage.local` Keys `kbTheme` (`system`|`light`|`dark`) und `kbZoomFactor` (`1.5x`–`4.0x`, Default `2.5x`).

## Verifikation — keine automatisierten Checks
Es gibt keinen `build`, `test`, `lint` oder `typecheck`. Verifikation ist manuell:
1. `chrome://extensions` → Entwicklermodus → "Entpackte Erweiterung laden" → diesen Ordner wählen.
2. Auf `https://www.kleinanzeigen.de/` Suchergebnisse hovern (300 ms Delay, `content.js:379`), Karte, Bild-Galerie, Zoom/Rotation, Theme-Switch im Popup testen.
3. Bei `fetchAdDetails`-Änderungen auch Cache, Fallback-Regex auf `/prod-ads/` (`content.js:88`) und Standort/Description-Parsing prüfen.

## Gotchas
- `.gitignore:1` ignoriert `.DS_Store`; kein CI, keine `opencode.json` — nicht anlegen ohne Auftrag.
- Selektoren sind fragil (Kleinanzeigen-DOM: `#viewad-image`, `#viewad-description-text`, `#viewad-locality`); Änderungen dort brechen die Preview.
- `chrome.storage` existiert im Content-Script nur im Extension-Kontext — außerhalb des Browsers nicht testbar.

## Arbeitsregeln
- **Kleinstmögliche Diffs.** Nur explizit genannte Dateien/Komponenten anfassen; keine Refactors, kein Umbenennen, kein Aufräumen, keine Format-/Sortier-Änderungen an ungenanntem Code.
- **Plan zuerst:** vor Änderungen kurz betroffene Dateien + Vorgehen auflisten; bei größeren Änderungen auf Bestätigung warten (triviale 1-Zeilen-Fixes ausgenommen).
- **Keine neuen Dependencies, kein Löschen/Umbenennen** ohne explizite Freigabe.
- **Deutsche UI-Texte nicht umschreiben/verbessern** — nur strukturell/technisch ändern wenn explizit gefordert.
- **Ein Feature/Fix pro Antwort** — keine Bonus-Änderungen.
- Nach jeder Änderung kurz zusammenfassen welche Dateien warum geändert wurden.
- Bei vager Aufgabe 1–2 Rückfragen statt raten.

## Ordnerstruktur
Nur **ein** aktiver Projektordner (`kleinePreviewZeiger`). Experimente über Git-Branches, nicht über Ordner-Kopien. Geschwister-Ordner unter `ChromeExtensions/` (`kleinanzeigen-boost-remix*`, `rightClickKleinanzeigen` etc.) sind Altlasten — nicht anfassen.
