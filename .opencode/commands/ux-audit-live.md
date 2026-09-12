---
description: UX-Audit des Preview-Flows live im Browser
agent: build
---
Prüfe live auf dem Kleinanzeigen-Tab (per chrome-devtools, Tab nach vorn holen):
1. Item per synthetischem mouseenter hovern, 400ms warten, prüfen ob #kb-preview-card sichtbar (evaluate).
2. Screenshot der Card + Snapshot der Buttons (Anzeige ansehen, Route planen, Debug-Reihe).
3. Galerie-Weiter-Button anklicken (falls >1 Bild), Zähler prüfen (1/2 → 2/2).
4. Maus 200px weiterbewegen, prüfen ob Card folgt (Top/Left vorher/nachher per evaluate).
Bericht: Flow-Brüche, tote Buttons, Clipping. Screenshots nach tmp/opencode/screens ablegen. Nichts im Repo ändern.
