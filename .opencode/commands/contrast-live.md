---
description: Gerenderte Kontraste nachmessen (WCAG)
agent: build
---
Card per Hover öffnen (beide Themes: documentElement data-kb-theme light/dark setzen, je 500ms warten).
Pro Theme per evaluate getComputedStyle auslesen und WCAG-Ratio rechnen für:
Titel/Text, Preis, Location, Buttons (Text auf Grund), Debug-Toggles aktiv/inaktiv,
kb-item-label, Clamp-Rahmen. Schwellwerte 4.5:1 Text, 3:1 UI.
Fällt ein Theme-Flip um (hell↔dunkel vertauscht), als Bug melden. Nur Bericht.
