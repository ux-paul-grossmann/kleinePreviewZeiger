---
description: Sweep alle Treffer × 9 Zonen per MCP, Lücken-Tabelle
agent: build
---
Führe per chrome-devtools MCP auf dem Kleinanzeigen-Tab (s-preis::120/macbook) den
Positions-Sweep aus: alle li.relative.mb-xsmall × 9 Zonen synthetisch anfahren
(mouseenter + mousemove mit Zonen-Mittelpunkten), pro Position auslesen:
Card-Box (style.top/left + offsetWidth/Height), Lücke Cursor→Card in px,
Viewport-Einhaltung (15px), Zone, Treffer-Höhe.
Regeln: erst ein Item echt hovern + 2,5s Render warten, dann synchron sweepen
(kein Warten pro Zone), mouseleave ans Vor-Item senden, ~27 Anzeigen-Fetches
sind normal (Cache). Maus vorher parken, nichts anklicken.
Bericht: Tabelle pro Zone (n, min-Lücke, Treffer), nur onscreen Items zählen,
Verstöße (Lücke <32px oder außerhalb Viewport) einzeln mit Item-Index.
Repo bleibt unberührt.
