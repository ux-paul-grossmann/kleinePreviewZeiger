---
description: Accessibility live prüfen (Tastatur, ARIA, Ziele)
agent: build
---
Auf dem Kleinanzeigen-Tab mit geöffneter Card per chrome-devtools evaluate prüfen:
1. Alle Buttons der Card: vorhandenes aria-label, sichtbarer Fokus-Rahmen (getComputedStyle outline/box-shadow bei focus).
2. Touch-Ziele: getBoundingClientRect aller .kb-debug-toggle + Aktions-Buttons, Liste alles <24px.
3. matchMedia('(prefers-reduced-motion: reduce)') + prüfen ob Card-Transition (top/left 0.15s) abgeschaltet wird.
4. Alt-Text des Galerie-Bildes + Kontrast der Debug-Labels nachrechnen.
Bericht als Tabelle, nichts ändern.
