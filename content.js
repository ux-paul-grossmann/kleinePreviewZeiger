// KleinePreviewZeiger: Hover-Vorschau für Kleinanzeigen-Trefferlisten
// Einstieg unten bei attachHoverListeners, Positionierung in positionCardAtCursor
(() => {
  const cache = new Map();

  let hoverTimeout = null;
  let currentMouseX = 0;
  let currentMouseY = 0;
  let currentItemRect = null;
  let currentZoomFactor = "2.5x";
  let currentHomeLocation = "";
  let showDebugZones = true;
  let debugOverlay = null;
  let clampOverlay = null;
  let showMouseMarker = true;
  let mouseMarker = null;
  let itemHover = false;
  let mouseInCard = false;
  let lastMove = { x: 0, y: 0, t: 0 };
  let showItemLabels = true;
  let showClampZone = true;
  let showItemHighlight = true;
  let showTrackLog = true;
  // Debug-UI Schalter aus dem Popup (Standard an)
  let debugAktiv = true;
  // Start Häkchen: aus bedeutet nach dem Laden alles aus bis zur ersten Berührung
  let startAktiv = true;
  // Main Module und Sub Module aus der Advanced View (Standard an)
  // Schlüssel nach Muster kbMod, Aus bedeutet Funktion überspringen
  // Ausnahme: Voraus ist Standard aus (bisheriges Verhalten bleibt)
  let mod = {};
  const MOD_STD_AUS = ["kbModPositionVoraus", "kbModPositionRuder"];
  function modAn(schluessel) {
    const wert = mod[schluessel];
    if (wert === undefined) return MOD_STD_AUS.indexOf(schluessel) === -1;
    return wert !== false;
  }
  // Tether gilt nur bei Main Module Positioning an
  function tetherAktiv() {
    return modAn("kbModTether") && modAn("kbModPositioning");
  }
  // Tether Werte mit Standard: Richtung Auto, Distanz 32 Pixel
  function modWert(schluessel, standard) {
    const wert = mod[schluessel];
    return wert === undefined ? standard : wert;
  }
  // Apple Identifier State: Modelle und Vorlage vorab deklarieren (kein TDZ beim Laden)
  let APPLE_MODELLE = [];
  let appleVorlage = "{name} | {jahr} | {chip} | {ram}";
  // Letzte Preview-Card Daten für Live Neurender bei Modul Wechsel
  let letztePreviewCard = null;
  let lastTrackLog = 0;
  let lastTrackSig = "";
  let lastZoneLogged = null;
  let lastItemTopLogged = 0;
  let trackDir = 0;
  let trackSpd = 0;
  let stuckAbove = false;
  // Hysterese Cherry Pick: gemerkte Spalte und Reihe gegen Zonen Flattern
  let lastCol = -1;
  let lastRow = -1;
  // Voraus Richtung: geglätteter Einheitsvektor der Mausbewegung
  let bewegX = 0;
  let bewegY = 0;

  function isExtensionAlive() {
    try {
      return typeof chrome !== "undefined" && !!(chrome.runtime && chrome.runtime.id);
    } catch (e) {
      return false;
    }
  }

  function labelFor(i) {
    let s = "";
    i++;
    do {
      i--;
      s = String.fromCharCode(65 + (i % 26)) + s;
      i = Math.floor(i / 26);
    } while (i > 0);
    return s;
  }

  // Debug-Anzeigen: Buchstaben-Badges, Clamp-Rahmen und Treffer-Hervorhebung schalten
  function updateItemLabels() {
    document.querySelectorAll("li.relative.mb-xsmall").forEach((item, i) => {
      let badge = item.querySelector(":scope > .kb-item-label");
      if (showItemLabels && debugAktiv !== false && startAktiv) {
        if (getComputedStyle(item).position === "static") item.style.position = "relative";
        const label = labelFor(i);
        if (!badge) {
          badge = document.createElement("span");
          badge.className = "kb-item-label";
          badge.textContent = label;
          item.appendChild(badge);
        } else if (badge.textContent !== label) {
          // nur bei Änderung schreiben — sonst Endlosschleife via MutationObserver
          badge.textContent = label;
        }
      } else if (badge) {
        badge.remove();
      }
    });
  }

  const ZONE_MAP = [
    ["top-left", "top-center", "top-right"],
    ["center-left", "center-center", "center-right"],
    ["bottom-left", "bottom-center", "bottom-right"],
  ];

  // Tether Anker: feste Seiten als Zonen Namen
  const TETHER_ANKER = {
    N: "top-center",
    NO: "top-right",
    O: "center-right",
    SO: "bottom-right",
    S: "bottom-center",
    SW: "bottom-left",
    W: "center-left",
    NW: "top-left",
  };
  // Zonenband mit Hysterese Cherry Pick aus Experiment: Wechsel erst nach
  // 5 Prozent Übertritt über die Zonengrenze, kein Flattern bei Verweilen
  function zoneBand(rel, last) {
    const m = 0.05;
    const lo = last === 0 ? 0.33 + m : (last === 2 ? 0.33 - m : 0.33);
    const hi = last === 2 ? 0.66 - m : (last === 0 ? 0.66 + m : 0.66);
    if (rel < lo) return 0;
    if (rel > hi) return 2;
    return 1;
  }

  function currentZone() {
    if (!currentItemRect) return null;
    const r = currentItemRect;
    const relX = (currentMouseX - r.left) / r.width;
    const relY = (currentMouseY - r.top) / r.height;
    if (!modAn("kbModPositionHysterese")) {
      const col = relX < 0.33 ? 0 : relX < 0.66 ? 1 : 2;
      const row = relY < 0.33 ? 0 : relY < 0.66 ? 1 : 2;
      return ZONE_MAP[row][col];
    }
    lastCol = zoneBand(relX, lastCol);
    lastRow = zoneBand(relY, lastRow);
    return ZONE_MAP[lastRow][lastCol];
  }

  function updateDebugOverlay() {
    if (!debugOverlay) return;
    if (debugAktiv === false || !startAktiv || !showDebugZones || !currentItemRect || previewCard.classList.contains("kb-card-hidden")) {
      debugOverlay.style.display = "none";
      return;
    }
    const r = currentItemRect;
    debugOverlay.style.display = "grid";
    debugOverlay.style.left = `${Math.round(r.left)}px`;
    debugOverlay.style.top = `${Math.round(r.top)}px`;
    debugOverlay.style.width = `${Math.round(r.width)}px`;
    debugOverlay.style.height = `${Math.round(r.height)}px`;
    const zone = currentZone();
    debugOverlay.querySelectorAll(".kb-debug-cell").forEach((c) => {
      c.classList.toggle("kb-active", c.dataset.zone === zone);
    });
  }

  function updateClampOverlay() {
    if (!clampOverlay) return;
    clampOverlay.style.display = (showClampZone && debugAktiv !== false && startAktiv) ? "block" : "none";
  }

  function updateItemHighlight() {
    document.body.classList.toggle("kb-highlight-items", showItemHighlight && debugAktiv !== false && startAktiv);
  }

  // Debug-UI aus dem Popup: Reihe ein-/ausblenden, bei Aus alle Anzeigen löschen
  function applyDebugUi() {
    const row = previewCard.querySelector(".kb-debug-row");
    if (row) row.style.display = debugAktiv === false ? "none" : "";
    // Schalter aus oder ohne Start Häkchen und noch keine Berührung: alles löschen
    if (debugAktiv === false || !startAktiv) {
      if (debugOverlay) debugOverlay.style.display = "none";
      if (clampOverlay) clampOverlay.style.display = "none";
      if (mouseMarker) mouseMarker.style.display = "none";
      document.body.classList.remove("kb-highlight-items");
      document.querySelectorAll(".kb-item-label").forEach((badge) => badge.remove());
    } else {
      updateClampOverlay();
      updateItemHighlight();
      updateItemLabels();
      updateDebugOverlay();
    }
  }

  // Einzelstand in den Speicher schreiben (Mirror für Popup-Schalter)
  function storeDebug(schluessel, wert) {
    try {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ [schluessel]: wert });
      }
    } catch (fehler) { /* Speicher nicht verfügbar: Stand bleibt sitzungsweit */ }
  }

  // Offene Card-Tasten mit Stand abgleichen (nach Mirror-Schalter aus Popup)
  function syncCardDebugButtons() {
    const paare = [
      ["#kb-debug-toggle", showDebugZones],
      ["#kb-mouse-toggle", showMouseMarker],
      ["#kb-labels-toggle", showItemLabels],
      ["#kb-clamp-toggle", showClampZone],
      ["#kb-items-toggle", showItemHighlight],
      ["#kb-log-toggle", showTrackLog],
    ];
    paare.forEach(([selektor, aktiv]) => {
      const knopf = previewCard.querySelector(selektor);
      if (knopf) knopf.classList.toggle("kb-active", aktiv);
    });
    const blick = previewCard.querySelector("#kb-transp-toggle");
    if (blick) blick.classList.toggle("kb-active", previewCard.classList.contains("kb-transparent"));
  }

  // Akzentfarben wie macOS Darstellung (ohne Auswahl = Standard ohne Überschreibung)
  const KB_ACCENTS = {
    blau: { base: "#0A84FF", hover: "#0073E6", text: "#ffffff" },
    violett: { base: "#BF5AF2", hover: "#A63FE0", text: "#ffffff" },
    pink: { base: "#FF375F", hover: "#E0264F", text: "#ffffff" },
    rot: { base: "#FF453A", hover: "#DE332A", text: "#ffffff" },
    orange: { base: "#FF9F0A", hover: "#DE8A00", text: "#ffffff" },
    gelb: { base: "#FFD60A", hover: "#DDB400", text: "#1c1c1e" },
    gruen: { base: "#30D158", hover: "#27B849", text: "#ffffff" },
    grau: { base: "#98989F", hover: "#82828A", text: "#ffffff" },
  };

  // Akzent auf den Hauptknopf der Vorschau-Card anwenden
  function applyAccent(id) {
    const a = KB_ACCENTS[id];
    if (!a) {
      previewCard.style.removeProperty("--kb-accent");
      previewCard.style.removeProperty("--kb-accent-hover");
      previewCard.style.removeProperty("--kb-accent-text");
      return;
    }
    previewCard.style.setProperty("--kb-accent", a.base);
    previewCard.style.setProperty("--kb-accent-hover", a.hover);
    previewCard.style.setProperty("--kb-accent-text", a.text);
  }

  function applyTheme(theme) {
    if (theme === "light" || theme === "dark") {
      document.documentElement.setAttribute("data-kb-theme", theme);
    } else {
      document.documentElement.removeAttribute("data-kb-theme");
    }
  }

  if (typeof chrome !== "undefined" && chrome.storage) {
    chrome.storage.local.get(["kbTheme", "kbZoomFactor", "kbHomeLocation"], (result) => {
      applyTheme(result.kbTheme || "system");
      if (result.kbZoomFactor) {
        currentZoomFactor = result.kbZoomFactor;
      }
      if (result.kbHomeLocation) {
        currentHomeLocation = result.kbHomeLocation;
      }
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes.kbTheme) {
        applyTheme(changes.kbTheme.newValue);
      }
      // Popup Akzent: Hauptknopf sofort umfärben
      if (area === "local" && changes.kbAccent) {
        applyAccent(changes.kbAccent.newValue);
      }
      if (area === "local" && changes.kbHomeLocation) {
        currentHomeLocation = changes.kbHomeLocation.newValue || "";
      }
      // Popup Debug-Modul: Reihe und Anzeigen sofort umschalten
      if (area === "local" && changes.kbDebugUiEnabled) {
        debugAktiv = changes.kbDebugUiEnabled.newValue !== false;
        applyDebugUi();
      }
      // Popup Startschalter: nur Startverhalten, keine Werkzeug-Zustände anfassen
      if (area === "local" && changes.kbDebugInitial) {
        startAktiv = changes.kbDebugInitial.newValue !== false;
        if (!startAktiv) lastTrackSig = "";
        applyDebugUi();
      }
      // Popup Mirror-Schalter: Stand übernehmen, Anzeige und Tasten nachführen
      if (area === "local" && changes.kbDbgZones) {
        showDebugZones = changes.kbDbgZones.newValue !== false;
        updateDebugOverlay();
        syncCardDebugButtons();
      }
      if (area === "local" && changes.kbDbgTransparent) {
        previewCard.classList.toggle("kb-transparent", changes.kbDbgTransparent.newValue === true);
        syncCardDebugButtons();
      }
      if (area === "local" && changes.kbDbgMouse) {
        showMouseMarker = changes.kbDbgMouse.newValue !== false;
        if (mouseMarker) mouseMarker.style.display = showMouseMarker && debugAktiv !== false ? "block" : "none";
        syncCardDebugButtons();
      }
      if (area === "local" && changes.kbDbgLabels) {
        showItemLabels = changes.kbDbgLabels.newValue !== false;
        updateItemLabels();
        syncCardDebugButtons();
      }
      if (area === "local" && changes.kbDbgClamp) {
        showClampZone = changes.kbDbgClamp.newValue !== false;
        updateClampOverlay();
        syncCardDebugButtons();
      }
      if (area === "local" && changes.kbDbgItems) {
        showItemHighlight = changes.kbDbgItems.newValue !== false;
        updateItemHighlight();
        syncCardDebugButtons();
      }
      if (area === "local" && changes.kbDbgLog) {
        showTrackLog = changes.kbDbgLog.newValue !== false;
        if (!showTrackLog) lastTrackSig = "";
        syncCardDebugButtons();
      }
      // Apple Vorlage: Ausgabe Format aus Popup übernehmen
      if (area === "local" && changes.kbAppleTemplate) {
        appleVorlage = changes.kbAppleTemplate.newValue || "{name} | {jahr} | {chip} | {ram}";
      }
      // Advanced View Module: Stand merken, offene Preview-Card live neu aufbauen
      if (area === "local") {
        let modWechsel = false;
        let renderWechsel = false;
        Object.keys(changes).forEach((k) => {
          if (k.indexOf("kbMod") === 0 || k.indexOf("kbTether") === 0) {
            mod[k] = changes[k].newValue;
            modWechsel = true;
            if (k === "kbModZoom" || k === "kbModDetails" || k === "kbModStandort" || k === "kbModPreis" || k === "kbModRoute" || k === "kbModArrow" || k === "kbModArrowGeometrie" || k === "kbModApple" || k === "kbAppleTemplate") {
              renderWechsel = true;
            }
          }
        });
        if (modWechsel) {
          applyModLive();
          if (!previewCard.classList.contains("kb-card-hidden") && letztePreviewCard) {
            if (renderWechsel) {
              renderCardContent(letztePreviewCard.data, letztePreviewCard.title, letztePreviewCard.price, letztePreviewCard.url);
            }
            positionCardAtCursor();
          }
        }
      }
    });
    // Darstellung nach Modul Wechsel neu anwenden (Thema und Akzent frisch lesen)
    function applyModLive() {
      const pfeil = previewCard.querySelector("#kb-arrow");
      if (pfeil) pfeil.style.display = modAn("kbModArrow") ? "" : "none";
      if (typeof chrome !== "undefined" && chrome.storage) {
        chrome.storage.local.get(["kbTheme", "kbAccent"], (r) => {
          applyTheme(r.kbTheme || "system");
          if (r.kbAccent) applyAccent(r.kbAccent);
          else applyAccent(null);
        });
      }
    }
    // Advanced View Module: Stände einmalig laden
    const MOD_SCHLUESSEL = ["kbModZoom", "kbModDetails", "kbModStandort", "kbModPreis", "kbModRoute", "kbModSwipe", "kbModSwipeUebergang", "kbModApple", "kbModPositioning", "kbModPositionZonen", "kbModPositionAbstand", "kbModPositionFlip", "kbModPositionClamp", "kbModPositionStuck", "kbModTether", "kbTetherRichtung", "kbTetherDistanz", "kbModPositionVoraus", "kbModPositionRuder", "kbModPositionEngstellen", "kbModPositionFreeze", "kbModPositionWachstum", "kbModPositionHysterese", "kbModArrow", "kbModArrowGeometrie"];
    chrome.storage.local.get(MOD_SCHLUESSEL, (r) => {
      mod = r;
    });
    // Apple Module: Modelle und Vorlage einmalig laden
    ladeAppleModelle();
    chrome.storage.local.get(["kbAppleTemplate"], (r) => {
      if (r.kbAppleTemplate) appleVorlage = r.kbAppleTemplate;
    });
    // Apple Vorlage: Ausgabe Format aus Popup übernehmen
    chrome.storage.local.get(["kbAppleTemplate"], (r) => {
      if (r.kbAppleTemplate) appleVorlage = r.kbAppleTemplate;
    });
    // Popup Akzent: initial auf den Hauptknopf anwenden
    chrome.storage.local.get(["kbAccent"], (r) => {
      if (r.kbAccent) applyAccent(r.kbAccent);
    });
    // Popup Debug-Modul: initial ein-/ausblenden plus Mirrorstände übernehmen
    // Ohne Start Häkchen bleibt nach dem Laden alles aus (Zustände bleiben unangetastet)
    chrome.storage.local.get(["kbDebugUiEnabled", "kbDebugInitial", "kbDbgZones", "kbDbgTransparent", "kbDbgMouse", "kbDbgLabels", "kbDbgClamp", "kbDbgItems", "kbDbgLog"], (r) => {
      debugAktiv = r.kbDebugUiEnabled !== false;
      const liesAn = (wert, standard) => (typeof wert === "boolean" ? wert : standard);
      showDebugZones = liesAn(r.kbDbgZones, true);
      showMouseMarker = liesAn(r.kbDbgMouse, true);
      showItemLabels = liesAn(r.kbDbgLabels, true);
      showClampZone = liesAn(r.kbDbgClamp, true);
      showItemHighlight = liesAn(r.kbDbgItems, true);
      showTrackLog = liesAn(r.kbDbgLog, true);
      if (r.kbDbgTransparent === true) previewCard.classList.add("kb-transparent");
      startAktiv = r.kbDebugInitial !== false;
      applyDebugUi();
      syncCardDebugButtons();
    });
  }

  // Vorschau-Card einmalig erzeugen und an den Seitenkörper hängen
  function createPreviewCard() {
    let card = document.getElementById("kb-preview-card");
    if (!card) {
      card = document.createElement("div");
      card.id = "kb-preview-card";
      card.className = "kb-card-hidden";
      document.body.appendChild(card);
    }
    return card;
  }

  const previewCard = createPreviewCard();

  // Card wächst async nach (Bilder/Description) → nachpositionieren, damit 32px-Abstand bleibt
  // Wachstum Sub aus: kein Nachführen bei Größenänderung
  new ResizeObserver(() => {
    if (modAn("kbModPositionWachstum") && shouldTrack(0)) positionCardAtCursor();
  }).observe(previewCard);

  debugOverlay = document.createElement("div");
  debugOverlay.id = "kb-debug-overlay";
  debugOverlay.style.display = "none";
  debugOverlay.innerHTML = ZONE_MAP.flat().map((z) => `<div class="kb-debug-cell" data-zone="${z}">${z}</div>`).join("");
  document.body.appendChild(debugOverlay);

  clampOverlay = document.createElement("div");
  clampOverlay.id = "kb-clamp-overlay";
  clampOverlay.style.display = "none";
  document.body.appendChild(clampOverlay);

  // DOM-Ringpuffer als Console-Mirror (für MCP-Auslesung)
  let trackBuf = document.getElementById("kb-track-log");
  if (!trackBuf) {
    trackBuf = document.createElement("div");
    trackBuf.id = "kb-track-log";
    trackBuf.style.display = "none";
    document.body.appendChild(trackBuf);
  }

  mouseMarker = document.createElement("div");
  mouseMarker.id = "kb-mouse-marker";
  mouseMarker.style.display = "none";
  document.body.appendChild(mouseMarker);

  previewCard.addEventListener("mouseenter", () => {
    mouseInCard = true;
    // Jeder Card-Entry = Issue-Indiz, keine Ausnahmen in dieser Testphase
    const r = currentItemRect;
    const inItem = !!r && currentMouseX >= r.left && currentMouseX <= r.right && currentMouseY >= r.top && currentMouseY <= r.bottom;
    trackLog(`PROBLEM Preview-Card-Eintritt Maus=(${Math.round(currentMouseX)},${Math.round(currentMouseY)}) Zone=${r ? currentZone() : "keine"} PreviewCardOberkante=${previewCard.offsetTop} PreviewCardHoehe=${previewCard.offsetHeight} ImTreffer=${inItem ? "ja" : "nein"} TrefferAktiv=${itemHover ? "ja" : "nein"}`);
  });
  previewCard.addEventListener("mouseleave", () => { mouseInCard = false; });

  // Tracking-Bedingung, gemeinsam für Mousemove + ResizeObserver:
  // Freeze nur außerhalb des Items (echte Card-Interaktion). Solange der Cursor
  // über dem geho hoverten Item reist (auch geometrisch in der überlappenden Card),
  // flieht die Card weiter vor dem Cursor; zügige Durchfahrt ebenso.
  // Debug-Protokoll: gedrosselt in Console und DOM-Ringpuffer schreiben
  function trackLog(msg, sig) {
    if (!showTrackLog || debugAktiv === false || !startAktiv) return;
    const now = performance.now();
    const signature = sig || msg;
    if (signature !== lastTrackSig || now - lastTrackLog > 500) {
      lastTrackSig = signature;
      lastTrackLog = now;
      console.log(`[kb-track] ${msg}`);
      const buf = document.getElementById("kb-track-log");
      if (buf) {
        const line = document.createElement("div");
        line.textContent = `[kb-track] ${msg}`;
        buf.appendChild(line);
        while (buf.children.length > 400) buf.firstChild.remove();
      }
    }
  }

  function shouldTrack(speed) {
    if (!currentItemRect || !itemHover || previewCard.classList.contains("kb-card-hidden")) return false;
    // Einfrieren Sub aus: immer folgen, nie in der Preview-Card stehenbleiben
    if (!modAn("kbModPositionFreeze")) return true;
    if (!mouseInCard) return true;
    const r = currentItemRect;
    if (currentMouseX >= r.left && currentMouseX <= r.right && currentMouseY >= r.top && currentMouseY <= r.bottom) return true;
    if (speed > 0.25) return true;
    trackLog(`STARRE Maus in Preview-Card ausserhalb Treffer Tempo=${speed.toFixed(2)}`, "freeze");
    return false;
  }

  // Mausverfolgung: Card bei jedem Zug neu positionieren, solange Tracking erlaubt ist
  document.addEventListener("mousemove", (e) => {
    const now = performance.now();
    const dt = now - (lastMove.t || now);
    const speed = dt > 0 ? Math.hypot(e.clientX - lastMove.x, e.clientY - lastMove.y) / dt : 0; // px pro ms
    const dyMove = e.clientY - lastMove.y;
    const dxMove = e.clientX - lastMove.x;
    trackDir = dyMove === 0 ? 0 : (dyMove > 0 ? 1 : -1);
    trackSpd = speed;
    // Voraus Richtung glätten: Einheitsvektor nur bei echter Bewegung nachführen
    const weg = Math.hypot(dxMove, dyMove);
    if (weg > 0 && speed > 0.05) {
      bewegX += 0.25 * (dxMove / weg - bewegX);
      bewegY += 0.25 * (dyMove / weg - bewegY);
    }
    lastMove = { x: e.clientX, y: e.clientY, t: now };
    currentMouseX = e.clientX;
    currentMouseY = e.clientY;
    if (showMouseMarker && debugAktiv !== false && startAktiv && mouseMarker) {
      mouseMarker.style.display = "block";
      mouseMarker.style.left = `${e.clientX}px`;
      mouseMarker.style.top = `${e.clientY}px`;
    }
    // Tether Sub aus: Preview-Card steht fest ab Entry, kein Nachführen
    if (tetherAktiv() && shouldTrack(speed)) {
      positionCardAtCursor();
      updateDebugOverlay();
    }
  });

  function parseHtmlDescription(htmlContainer) {
    if (!htmlContainer) return "Keine Beschreibung vorhanden.";
    
    let html = htmlContainer.innerHTML;

    html = html.replace(/<br\s*\/?>/gi, "\n");
    html = html.replace(/<\/(p|div|li|h1|h2|h3|h4|h5|h6)>/gi, "\n");
    html = html.replace(/<p[^>]*>/gi, "");

    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = html;
    
    return (tempDiv.textContent || tempDiv.innerText || "")
      .replace(/\n\s*\n/g, "\n\n")
      .trim();
  }

  async function fetchAdDetails(url) {
    if (cache.has(url)) return cache.get(url);
    try {
      const res = await fetch(url);
      const html = await res.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

      const vipGallery = doc.querySelector(".vip-image-gallery");
      const mainImage = doc.querySelector("#viewad-image");
      const galleryWrapper =
        vipGallery ||
        (mainImage ? mainImage.closest("article, section, [class*='gallery'], div.relative") : null);

      let rawImgs = [];
      if (galleryWrapper) {
        rawImgs = Array.from(galleryWrapper.querySelectorAll("img"))
          .map((i) => i.src || i.getAttribute("src"))
          .filter((src) => src && src.includes("/prod-ads/"));
      }

      if (rawImgs.length === 0) {
        const cdnMatches =
          html.match(/https?:\/\/img\.kleinanzeigen\.de\/api\/v1\/prod-ads\/images\/[a-zA-Z0-9_\-]+/g) || [];
        rawImgs = cdnMatches;
      }

      const highResImgs = rawImgs.map((imgUrl) =>
        imgUrl.replace(/\?rule=\$_[0-9a-zA-Z_\.]+/, "?rule=$_59.JPG")
      );
      const images = [...new Set(highResImgs)];

      const descEl = doc.querySelector("#viewad-description-text, [class*='description']");
      const description = parseHtmlDescription(descEl);

      const location =
        doc.querySelector("#viewad-locality, [class*='locality']")?.innerText.trim() ||
        "Standort unbekannt";

      const data = { images, description, location };
      cache.set(url, data);
      return data;
    } catch (err) {
      console.error("Fehler beim Laden der Vorschau:", err);
      return null;
    }
  }

  function setupZoomPan(imgContainer, imgEl) {
    let isZoomed = false;
    let rotationAngle = 0;
    let isPanningLocked = false;

    function applyZoomScale() {
      const numScale = parseFloat(currentZoomFactor);
      imgContainer.style.setProperty("--kb-zoom-scale", numScale);
    }

    applyZoomScale();

    function updateZoomPosition(e) {
      const rect = imgContainer.getBoundingClientRect();
      let x = ((e.clientX - rect.left) / rect.width) * 100;
      let y = ((e.clientY - rect.top) / rect.height) * 100;

      const normAngle = ((rotationAngle % 360) + 360) % 360;

      if (normAngle === 90) {
        const tempX = x;
        x = y;
        y = 100 - tempX;
      } else if (normAngle === 180) {
        x = 100 - x;
        y = 100 - y;
      } else if (normAngle === 270) {
        const tempX = x;
        x = 100 - y;
        y = tempX;
      }

      imgEl.style.transformOrigin = `${x}% ${y}%`;
    }

    async function copyVisibleCropToClipboard() {
      const rect = imgContainer.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas context missing");
      const zoomScale = parseFloat(currentZoomFactor) || 1;
      const originStr = imgEl.style.transformOrigin || "center center";
      let ox = 50, oy = 50;
      const m = originStr.match(/([\d.]+)%\s+([\d.]+)%/);
      if (m) { ox = parseFloat(m[1]); oy = parseFloat(m[2]); }
      const imgW = imgEl.naturalWidth || rect.width;
      const imgH = imgEl.naturalHeight || rect.height;
      const coverScale = Math.max(rect.width / imgW, rect.height / imgH);
      const drawW = imgW * coverScale;
      const drawH = imgH * coverScale;
      const originOffsetX = ((ox - 50) * rect.width) / 100;
      const originOffsetY = ((oy - 50) * rect.height) / 100;
      ctx.scale(dpr, dpr);
      ctx.translate(rect.width / 2, rect.height / 2);
      ctx.rotate((rotationAngle * Math.PI) / 180);
      ctx.translate(originOffsetX, originOffsetY);
      ctx.scale(isZoomed ? zoomScale : 1, isZoomed ? zoomScale : 1);
      ctx.translate(-originOffsetX, -originOffsetY);
      ctx.translate(-drawW / 2, -drawH / 2);
      // Canvas darf nie mit tainted imgEl gezeichnet werden (taints bleibt), daher direkt via fetch/CORS
      let drew = false;
      try {
        const res = await fetch(imgEl.src, { mode: "cors" });
        if (!res.ok) throw new Error(`fetch ${res.status}`);
        const blob = await res.blob();
        const bitmap = await createImageBitmap(blob);
        ctx.drawImage(bitmap, 0, 0, drawW, drawH);
        drew = true;
      } catch (e) {
        console.warn("fetch draw failed", e);
        // letzter Versuch: direkter draw (wird tainten, aber toBlob wird dann fehlschlagen)
        try {
          ctx.drawImage(imgEl, 0, 0, drawW, drawH);
          drew = true;
        } catch (ee) {
          console.warn("direct draw failed", ee);
        }
      }
      if (!drew) throw new Error("Bild konnte nicht gezeichnet werden (CORS)");
      const blob = await new Promise((resolve, reject) => canvas.toBlob((b) => b ? resolve(b) : reject(new Error("toBlob failed")), "image/png"));
      const ClipboardItemCtor = window.ClipboardItem || window.ClipboardItem;
      if (navigator.clipboard && typeof ClipboardItemCtor !== "undefined") {
        try {
          await navigator.clipboard.write([new ClipboardItemCtor({ "image/png": blob })]);
          return;
        } catch (e) {
          console.warn("clipboard.write image failed, fallback to text", e);
        }
      }
      // Fallback: URL als Text
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(imgEl.src);
        return;
      }
      throw new Error("Clipboard API unavailable");
    }

    imgContainer.addEventListener("mousemove", (e) => {
      if (isZoomed && !isPanningLocked) {
        updateZoomPosition(e);
      }
    });

    imgContainer.addEventListener("click", (e) => {
      if (isPanningLocked) return;
      if (
        e.target.closest(".kb-nav-btn") ||
        e.target.closest(".kb-zoom-dropdown") ||
        e.target.closest(".kb-rotate-btn") ||
        e.target.closest(".kb-copy-btn") ||
        e.target.closest(".kb-cancel-btn") ||
        e.target.closest("#kb-copy-actions")
      ) {
        return;
      }

      isZoomed = !isZoomed;
      if (isZoomed) {
        updateZoomPosition(e);
        imgContainer.classList.add("kb-zoomed");
      } else {
        imgContainer.classList.remove("kb-zoomed");
        imgEl.style.transformOrigin = "center center";
      }
    });

    imgContainer.addEventListener("mouseleave", () => {
      if (isPanningLocked) return;
      if (isZoomed) {
        isZoomed = false;
        imgContainer.classList.remove("kb-zoomed");
        imgEl.style.transformOrigin = "center center";
      }
    });

    imgContainer.addEventListener("contextmenu", (e) => {
      if (!isZoomed) return;
      e.preventDefault();
      e.stopPropagation();
      if (isPanningLocked) return;
      isPanningLocked = true;
      imgContainer.classList.add("kb-panning-locked");
      const copyActions = imgContainer.querySelector("#kb-copy-actions");
      if (copyActions) copyActions.classList.remove("kb-copy-hidden");
    });

    const rotateBtn = imgContainer.querySelector(".kb-rotate-btn");
    if (rotateBtn) {
      rotateBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        rotationAngle = (rotationAngle + 90) % 360;
        imgContainer.style.setProperty("--kb-rotation", `${rotationAngle}deg`);

        if (isZoomed) {
          updateZoomPosition(e);
        }
      });
    }

    const zoomDropdown = imgContainer.querySelector(".kb-zoom-dropdown");
    if (zoomDropdown) {
      const triggerBtn = zoomDropdown.querySelector(".kb-zoom-trigger");
      const options = zoomDropdown.querySelectorAll(".kb-zoom-option");

      triggerBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        zoomDropdown.classList.toggle("kb-open");
      });

      options.forEach((opt) => {
        opt.addEventListener("click", (e) => {
          e.stopPropagation();
          currentZoomFactor = opt.dataset.zoom;
          triggerBtn.textContent = currentZoomFactor;

          options.forEach((o) => o.classList.remove("kb-active"));
          opt.classList.add("kb-active");

          applyZoomScale();
          zoomDropdown.classList.remove("kb-open");

          if (typeof chrome !== "undefined" && chrome.storage) {
            chrome.storage.local.set({ kbZoomFactor: currentZoomFactor });
          }
        });
      });
    }

    const copyBtn = imgContainer.querySelector(".kb-copy-btn");
    const cancelBtn = imgContainer.querySelector(".kb-cancel-btn");
    const copyActions = imgContainer.querySelector("#kb-copy-actions");
    if (copyBtn) {
      copyBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!isPanningLocked || !isExtensionAlive()) return;
        try {
          await copyVisibleCropToClipboard();
          copyBtn.classList.add("kb-copy-success");
          copyBtn.textContent = "✓ Kopieren erfolgreich";
          setTimeout(() => {
            isPanningLocked = false;
            imgContainer.classList.remove("kb-panning-locked");
            if (copyActions) copyActions.classList.add("kb-copy-hidden");
            copyBtn.classList.remove("kb-copy-success");
            copyBtn.textContent = "Bildausschnitt in Zwischenablage kopieren";
          }, 1000);
        } catch (err) {
          console.error("Copy failed:", err);
          copyBtn.textContent = "Fehler beim Kopieren";
          setTimeout(() => {
            isPanningLocked = false;
            imgContainer.classList.remove("kb-panning-locked");
            if (copyActions) copyActions.classList.add("kb-copy-hidden");
            copyBtn.textContent = "Bildausschnitt in Zwischenablage kopieren";
          }, 1000);
        }
      });
    }
    if (cancelBtn) {
      cancelBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        isPanningLocked = false;
        imgContainer.classList.remove("kb-panning-locked");
        if (copyActions) copyActions.classList.add("kb-copy-hidden");
        // reset copy btn text in case it was in success state
        if (copyBtn) {
          copyBtn.classList.remove("kb-copy-success");
          copyBtn.textContent = "Bildausschnitt in Zwischenablage kopieren";
        }
      });
    }

    return {
      resetRotation: () => {
        rotationAngle = 0;
        imgContainer.style.setProperty("--kb-rotation", "0deg");
      },
      resetLock: () => {
        isPanningLocked = false;
        imgContainer.classList.remove("kb-panning-locked");
        if (copyActions) copyActions.classList.add("kb-copy-hidden");
        const b = imgContainer.querySelector(".kb-copy-btn");
        if (b) {
          b.classList.remove("kb-copy-success");
          b.textContent = "Bildausschnitt in Zwischenablage kopieren";
        }
      }
    };
  }

  // Apple Identifier Modul: kuratierte Modelle laden, Treffer als Tags zeigen
  async function ladeAppleModelle() {
    if (APPLE_MODELLE.length) return;
    try {
      const basis = (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL) ? chrome.runtime.getURL("apple-models.json") : "apple-models.json";
      const antwort = await fetch(basis);
      const daten = await antwort.json();
      if (daten && daten.modelle) APPLE_MODELLE = daten.modelle;
    } catch (fehler) { /* ohne Modelle keine Tags */ }
  }
  function appleNormalisieren(text) {
    return String(text || "").toLowerCase().replace(/\s+/g, " ");
  }
  function wortTreffer(text, alias) {
    const muster = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+");
    return new RegExp(`(^|[^a-z0-9])${muster}([^a-z0-9]|$)`, "i").test(text);
  }
  // Seriennummer Baujahr Codes, ca. Werte, ab 2021 zufällig ohne Info
  const SN_JAHR = { C: "2010", D: "2011", F: "2012", G: "2013", H: "2014", J: "2015", K: "2016", L: "2017", M: "2018", N: "2019", P: "2020", Q: "2020", R: "2021", S: "2021", T: "2021" };
  function dekodiereSeriennummer(sn) {
    if (!/^[A-Z0-9]{12}$/.test(sn)) return null;
    const jahr = SN_JAHR[sn.charAt(3)];
    return jahr ? `ca. ${jahr}` : "zufällig";
  }
  function appleAnzeigeName(alias) {
    const SONDER = { iphone: "iPhone", ipad: "iPad", macbook: "MacBook", imac: "iMac", watch: "Watch", apple: "Apple", ultra: "Ultra", series: "Series", mini: "Mini", studio: "Studio", pro: "Pro", max: "Max", air: "Air" };
    return String(alias || "").split(" ").map((w) => {
      const klein = w.toLowerCase();
      if (SONDER[klein]) return SONDER[klein];
      if (/^[a-z]+\d+$/i.test(w) || /^\d/.test(w)) return w.toUpperCase();
      return w.charAt(0).toUpperCase() + w.slice(1);
    }).join(" ");
  }
  function wendeAppleTemplate(vorlage, modell) {
    const text = String(vorlage || "{name} | {jahr} | {chip} | {ram}")
      .replace("{name}", appleAnzeigeName(modell.namen[0] || ""))
      .replace("{jahr}", modell.jahr || "")
      .replace("{chip}", modell.chip || "")
      .replace("{ram}", modell.ram || "");
    return text.split("|").map((s) => s.trim()).filter((s) => s).join(" | ");
  }
  // Erkennung: Marketing Namen und Nummern aus Titel plus Beschreibung fischen
  // Treffer als {text} für Tags, maximal 6, Modelle zuerst
  // Geteilte A Nummer: mehrere Modelle teilen eine Nummer, Bereich ausgeben
  function erkenneApple(textRoh) {
    let treffer = [];
    const gesehen = {};
    if (!APPLE_MODELLE.length) return treffer;
    const text = appleNormalisieren(textRoh);
    const textGross = String(textRoh || "").toUpperCase();
    APPLE_MODELLE.forEach((m) => {
      let fund = "";
      (m.namen || []).forEach((n) => { if (!fund && wortTreffer(text, n)) fund = n; });
      (m.a || []).forEach((nr) => {
        if (!fund && new RegExp(`\\b${nr}\\b`, "i").test(textGross)) fund = nr;
      });
      (m.emc || []).forEach((nr) => {
        if (!fund && new RegExp(`\\bEMC\\s?${nr}\\b`, "i").test(textGross)) fund = "EMC " + nr;
      });
      if (fund && !gesehen[m.id]) {
        gesehen[m.id] = true;
        const aNr = /^A\d{4}$/i.test(fund) ? fund.toUpperCase() : "";
        treffer.push({ modell: m, fund, aNr, text: wendeAppleTemplate(appleVorlage, m) });
      }
    });
    // A Nummern Gruppen mit mehr als einem Modell zu Bereich Tags verdichten
    const gruppen = {};
    treffer.forEach((t) => {
      if (t.aNr) {
        if (!gruppen[t.aNr]) gruppen[t.aNr] = [];
        gruppen[t.aNr].push(t);
      }
    });
    Object.keys(gruppen).forEach((nr) => {
      const gruppe = gruppen[nr];
      if (gruppe.length < 2) return;
      const jahre = gruppe.map((t) => parseInt(t.modell.jahr, 10)).filter((j) => !isNaN(j));
      const chips = [];
      gruppe.forEach((t) => {
        if (t.modell.chip && chips.indexOf(t.modell.chip) === -1) chips.push(t.modell.chip);
      });
      const bereich = jahre.length ? `${Math.min(...jahre)}–${Math.max(...jahre)}` : "";
      let textNeu = nr;
      if (bereich) textNeu += ` · ${bereich}`;
      if (chips.length) textNeu += ` · ${chips.join("/")}`;
      treffer = treffer.filter((t) => t.aNr !== nr);
      treffer.push({ modell: null, fund: nr, aNr: nr, text: textNeu });
    });
    const rohNr = (muster, markierung) => {
      const gefunden = textGross.match(muster) || [];
      gefunden.forEach((nr) => {
        if (treffer.length < 6 && !treffer.some((t) => t.text.indexOf(nr) !== -1)) {
          treffer.push({ text: markierung ? `${markierung} ${nr}` : nr });
        }
      });
    };
    rohNr(/\bA\d{4}\b/g, "");
    rohNr(/\bEMC\s?\d{3,4}\b/g, "");
    const sns = textGross.match(/\b(?=[A-Z0-9]*[0-9])(?=[A-Z0-9]*[A-Z])[A-Z0-9]{12}\b/g) || [];
    sns.forEach((sn) => {
      if (treffer.length < 6 && !treffer.some((t) => t.text.indexOf(sn) !== -1)) {
        const jahr = dekodiereSeriennummer(sn);
        treffer.push({ text: jahr ? `SN ${sn} (${jahr})` : `SN ${sn}` });
      }
    });
    return treffer;
  }

  // Preview-Card Inhalt aufbauen und alle Schalter in der Preview-Card verdrahten
  function renderCardContent(data, title, price, url) {
    letztePreviewCard = { data, title, price, url };
    let currentImgIdx = 0;
    const hasImages = data.images && data.images.length > 0;
    const dest = data.location && data.location !== "Standort unbekannt" ? data.location : "";
    const origin = currentHomeLocation || "";
    let mapsUrl;
    if (dest && origin) {
      mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(dest)}`;
    } else if (dest) {
      mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;
    } else if (origin) {
      mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}`;
    } else {
      mapsUrl = `https://www.google.com/maps/search/?api=1&query=`;
    }

    const zoomLevels = ["1.5x", "2.0x", "2.5x", "3.0x", "4.0x", "8.0x"];

    // Apple Tags: Treffer vorab als Pillen HTML aufbereiten
    let appleTags = "";
    if (modAn("kbModApple")) {
      const appleTreffer = erkenneApple(title + "\n" + data.description);
      if (appleTreffer.length) {
        appleTags = `<div class="kb-apple-tags">${appleTreffer.map((t) => `<span class="kb-apple-tag">${t.text}</span>`).join("")}</div>`;
      }
    }

    previewCard.innerHTML = `
      <div class="kb-arrow" id="kb-arrow"></div>
      <div class="kb-image-container" id="kb-img-container">
        ${
          hasImages
            ? `<img src="${data.images[0]}" class="kb-main-img" id="kb-img-element" />`
            : `<div class="kb-no-img">Kein Bild vorhanden</div>`
        }
        ${
          hasImages && modAn("kbModZoom")
            ? `<button class="kb-rotate-btn" aria-label="Bild drehen">
                 <svg viewBox="0 0 24 24">
                   <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
                 </svg>
               </button>`
            : ""
        }
        ${
          hasImages && modAn("kbModZoom")
            ? `<div class="kb-zoom-dropdown">
                 <button class="kb-zoom-trigger" aria-label="Zoomfaktor wählen">${currentZoomFactor}</button>
                 <div class="kb-zoom-menu">
                   ${zoomLevels
                     .map(
                       (lvl) =>
                         `<button class="kb-zoom-option ${lvl === currentZoomFactor ? "kb-active" : ""}" data-zoom="${lvl}">${lvl}</button>`
                     )
                     .join("")}
                 </div>
               </div>`
            : ""
        }
        ${hasImages ? `<div class="kb-copy-actions kb-copy-hidden" id="kb-copy-actions"><button class="kb-copy-btn" aria-label="Bildausschnitt kopieren">Bildausschnitt in Zwischenablage kopieren</button><button class="kb-cancel-btn" aria-label="Abbrechen">Abbrechen</button></div>` : ""}
        ${
          hasImages && data.images.length > 1
            ? `<button class="kb-nav-btn kb-prev" aria-label="Vorheriges Bild">
                 <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"></polyline></svg>
               </button>
               <button class="kb-nav-btn kb-next" aria-label="Nächstes Bild">
                 <svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"></polyline></svg>
               </button>
               <span class="kb-img-counter">1 / ${data.images.length}</span>`
            : ""
        }
      </div>
      <div class="kb-header">
        <h4 class="kb-title">${title}</h4>
        ${modAn("kbModPreis") ? `<span class="kb-price">${price}</span>` : ""}
      </div>
      ${modAn("kbModDetails") ? `<div class="kb-details">
        ${modAn("kbModStandort") ? `<p class="kb-location">
          <svg class="kb-location-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="var(--kb-text-muted)">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/>
          </svg>
          <span>${data.location}</span>
        </p>` : ""}
        <div class="kb-description"></div>
      </div>` : ""}
      <div class="kb-actions">
        <a href="${url}" target="_blank" rel="noopener noreferrer" class="kb-btn kb-btn-primary">Anzeige ansehen <svg class="kb-btn-icon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>
        ${modAn("kbModRoute") ? `<a href="${mapsUrl}" target="_blank" rel="noopener noreferrer" class="kb-btn kb-btn-secondary">Route planen</a>` : ""}
      </div>
      ${appleTags ? `<div class="kb-apple-card"><div class="kb-apple-label">Apple Identifier</div>${appleTags}</div>` : ""}
      <div class="kb-debug-row">
        <button class="kb-debug-toggle" id="kb-debug-toggle" aria-label="Zonen-Debug an/aus">Zonen</button>
        <button class="kb-debug-toggle" id="kb-transp-toggle" aria-label="Card transparent an/aus">Transparent</button>
        <button class="kb-debug-toggle" id="kb-mouse-toggle" aria-label="Maus-Marker an/aus">Maus</button>
        <button class="kb-debug-toggle" id="kb-labels-toggle" aria-label="Item-Buchstaben an/aus">ABC</button>
        <button class="kb-debug-toggle" id="kb-clamp-toggle" aria-label="Clamp-Zone an/aus">Clamp</button>
        <button class="kb-debug-toggle" id="kb-items-toggle" aria-label="Treffer-Items hervorheben an/aus">Items</button>
        <button class="kb-debug-toggle" id="kb-log-toggle" aria-label="Tracking-Log an/aus">Log</button>
      </div>

    `;

    const descContainer = previewCard.querySelector(".kb-description");
    if (descContainer) {
      descContainer.textContent = data.description;
    }
    // Pfeil Gate: Aus blendet das Dreieck aus, folgend und gefroren
    const arrowNeu = previewCard.querySelector("#kb-arrow");
    if (arrowNeu) arrowNeu.style.display = modAn("kbModArrow") ? "" : "none";

    const imgContainer = previewCard.querySelector("#kb-img-container");
    const imgEl = previewCard.querySelector("#kb-img-element");

    let zoomControls = null;
    if (hasImages && imgEl && modAn("kbModZoom")) {
      zoomControls = setupZoomPan(imgContainer, imgEl);
    }

    if (hasImages && data.images.length > 1) {
      const counterEl = previewCard.querySelector(".kb-img-counter");
      // Bild wechseln mit Umbruch, Zoom zurücksetzen, Übergang je Toggle
      const zeigeBild = (richtung) => {
        currentImgIdx = (currentImgIdx + richtung + data.images.length) % data.images.length;
        imgEl.src = data.images[currentImgIdx];
        counterEl.textContent = `${currentImgIdx + 1} / ${data.images.length}`;
        if (modAn("kbModSwipeUebergang")) {
          imgEl.classList.remove("kb-gleiten-links", "kb-gleiten-rechts");
          void imgEl.offsetWidth;
          imgEl.classList.add(richtung > 0 ? "kb-gleiten-links" : "kb-gleiten-rechts");
        }
        if (zoomControls) { zoomControls.resetRotation(); zoomControls.resetLock(); }
      };

      previewCard.querySelector(".kb-prev").addEventListener("click", (e) => {
        e.stopPropagation();
        zeigeBild(-1);
      });

      previewCard.querySelector(".kb-next").addEventListener("click", (e) => {
        e.stopPropagation();
        zeigeBild(1);
      });

      // Swipe per Trackpad und Magic Mouse: waagrechte Bewegung schaltet
      // Bilder um, ein Bild je Wisch Geste mit Sperre und Richtungs Neustart
      let swipeRest = 0;
      let swipeSperre = 0;
      imgContainer.addEventListener("wheel", (e) => {
        if (!modAn("kbModSwipe")) return;
        if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
        e.preventDefault();
        const jetzt = Date.now();
        if (jetzt - swipeSperre < 650) return;
        if ((swipeRest > 0) !== (e.deltaX > 0)) swipeRest = 0;
        swipeRest += e.deltaX;
        if (Math.abs(swipeRest) >= 40) {
          zeigeBild(swipeRest > 0 ? 1 : -1);
          swipeRest = 0;
          swipeSperre = jetzt;
        }
      }, { passive: false });
    }



    const routeBtn = previewCard.querySelector(".kb-btn-secondary");
    if (routeBtn) {
      routeBtn.addEventListener("click", (e) => {
        e.preventDefault();
        const dest = data.location && data.location !== "Standort unbekannt" ? data.location : "";
        const origin = currentHomeLocation || "";
        let url;
        if (dest && origin) url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(dest)}`;
        else if (dest) url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;
        else if (origin) url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}`;
        else url = `https://www.google.com/maps/search/?api=1&query=`;
        window.open(url, "_blank", "noopener");
      });
    }

    const debugToggle = previewCard.querySelector("#kb-debug-toggle");
    if (debugToggle) {
      debugToggle.classList.toggle("kb-active", showDebugZones);
      debugToggle.addEventListener("click", (e) => {
        e.stopPropagation();
        showDebugZones = !showDebugZones;
        storeDebug("kbDbgZones", showDebugZones);
        debugToggle.classList.toggle("kb-active", showDebugZones);
        updateDebugOverlay();
      });
    }

    const transpToggle = previewCard.querySelector("#kb-transp-toggle");
    if (transpToggle) {
      transpToggle.classList.toggle("kb-active", previewCard.classList.contains("kb-transparent"));
      transpToggle.addEventListener("click", (e) => {
        e.stopPropagation();
        const on = previewCard.classList.toggle("kb-transparent");
        storeDebug("kbDbgTransparent", on);
        transpToggle.classList.toggle("kb-active", on);
      });
    }

    const mouseToggle = previewCard.querySelector("#kb-mouse-toggle");
    if (mouseToggle) {
      mouseToggle.classList.toggle("kb-active", showMouseMarker);
      mouseToggle.addEventListener("click", (e) => {
        e.stopPropagation();
        showMouseMarker = !showMouseMarker;
        storeDebug("kbDbgMouse", showMouseMarker);
        mouseToggle.classList.toggle("kb-active", showMouseMarker);
        if (mouseMarker) mouseMarker.style.display = showMouseMarker ? "block" : "none";
      });
    }

    const labelsToggle = previewCard.querySelector("#kb-labels-toggle");
    if (labelsToggle) {
      labelsToggle.classList.toggle("kb-active", showItemLabels);
      labelsToggle.addEventListener("click", (e) => {
        e.stopPropagation();
        showItemLabels = !showItemLabels;
        storeDebug("kbDbgLabels", showItemLabels);
        labelsToggle.classList.toggle("kb-active", showItemLabels);
        updateItemLabels();
      });
    }

    const clampToggle = previewCard.querySelector("#kb-clamp-toggle");
    if (clampToggle) {
      clampToggle.classList.toggle("kb-active", showClampZone);
      clampToggle.addEventListener("click", (e) => {
        e.stopPropagation();
        showClampZone = !showClampZone;
        storeDebug("kbDbgClamp", showClampZone);
        clampToggle.classList.toggle("kb-active", showClampZone);
        updateClampOverlay();
      });
    }

    const itemsToggle = previewCard.querySelector("#kb-items-toggle");
    if (itemsToggle) {
      itemsToggle.classList.toggle("kb-active", showItemHighlight);
      itemsToggle.addEventListener("click", (e) => {
        e.stopPropagation();
        showItemHighlight = !showItemHighlight;
        storeDebug("kbDbgItems", showItemHighlight);
        itemsToggle.classList.toggle("kb-active", showItemHighlight);
        updateItemHighlight();
      });
    }

    const logToggle = previewCard.querySelector("#kb-log-toggle");
    if (logToggle) {
      logToggle.classList.toggle("kb-active", showTrackLog);
      logToggle.addEventListener("click", (e) => {
        e.stopPropagation();
        showTrackLog = !showTrackLog;
        storeDebug("kbDbgLog", showTrackLog);
        logToggle.classList.toggle("kb-active", showTrackLog);
        if (showTrackLog) console.log("[kb-track] PROTOKOLL AN");
        else { lastTrackSig = ""; console.log("[kb-track] PROTOKOLL AUS"); }
      });
    }

    // Debug-Reihe je Popup-Schalter zeigen oder verstecken (frisches Card-HTML)
    const debugRow = previewCard.querySelector(".kb-debug-row");
    if (debugRow) debugRow.style.display = debugAktiv === false ? "none" : "";
  }

  // Kern: Card-Position aus 3x3-Zone, Flip-Logik und Viewport-Clamp berechnen
  function positionCardAtCursor() {
    const cardWidth = 360;
    const cardHeight = previewCard.offsetHeight || 450;
    const padding = 15;
    // Abstand Sub aus: kein Extra Abstand zum Mauszeiger
    // Distanz Slider legt den Wert fest, Standard 32 Pixel
    const flip = modAn("kbModPositionAbstand") ? modWert("kbTetherDistanz", 32) : 0;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left, top;
    let arrowClass = "kb-arrow kb-arrow-left";
    let arrowPos = null;

    if (currentItemRect) {
      const r = currentItemRect;
      // 3x3 zone based on mouse entry within item
      const relX = (currentMouseX - r.left) / r.width;
      const relY = (currentMouseY - r.top) / r.height;
      // Hysterese Sub aus: harte Zonengrenzen ohne Merken
      let col, row;
      if (modAn("kbModPositionHysterese")) {
        lastCol = zoneBand(relX, lastCol);
        lastRow = zoneBand(relY, lastRow);
        col = lastCol;
        row = lastRow;
      } else {
        col = relX < 0.33 ? 0 : relX < 0.66 ? 1 : 2;
        row = relY < 0.33 ? 0 : relY < 0.66 ? 1 : 2;
      }
      const zoneMap = [
        ["top-left", "top-center", "top-right"],
        ["center-left", "center-center", "center-right"],
        ["bottom-left", "bottom-center", "bottom-right"],
      ];
      let zone = zoneMap[row][col];
      // Main oder Zonen Sub aus: feste Mitte rechts, kein Folgen
      if (!modAn("kbModPositioning") || !modAn("kbModPositionZonen")) zone = "center-center";
      // Schmale (herausgefilterte) Items: Card immer seitlich, damit der vertikale Mausweg frei bleibt
      // Engstellen Sub aus: Regel ignorieren, normale Zonen werten
      // Tether Anker gewinnt vor Zonen und Engstellen
      const tetherAnker = tetherAktiv() ? modWert("kbTetherRichtung", "auto") : "auto";
      if (tetherAnker !== "auto" && TETHER_ANKER[tetherAnker]) {
        zone = TETHER_ANKER[tetherAnker];
      }
      if (modAn("kbModPositionEngstellen") && r.height < 60) {
        zone = currentMouseX < viewportWidth / 2 ? "center-right" : "center-left";
        trackLog(`SCHMALER-TREFFER Hoehe=${Math.round(r.height)} Zone=${zone}`, `narrow|${zone}`);
      }
      // Center-Spalte nie zentriert: Card seitlich, vertikaler Mausweg bleibt frei
      const sideLeft = currentMouseX < viewportWidth / 2 ? currentMouseX + flip : currentMouseX - cardWidth - flip;
      // Dreieck bleibt an Card (child), Card folgt Maus kontinuierlich
      if (zone === "center-center") {
        // Stuck Sub aus: nie oberhalb festhalten
        if (stuckAbove && modAn("kbModPositionStuck") && modAn("kbModPositioning")) {
          left = currentMouseX - cardWidth / 2;
          top = currentMouseY - cardHeight - flip;
        } else {
          left = currentMouseX + flip;
          top = currentMouseY - cardHeight / 2;
        }
        arrowClass = "kb-arrow kb-arrow-left"; arrowPos = { side: "left" };
      } else if (zone === "center-left") {
        left = currentMouseX - cardWidth - flip;
        top = currentMouseY - cardHeight / 2;
        arrowClass = "kb-arrow kb-arrow-right"; arrowPos = { side: "right" };
      } else if (zone === "center-right") {
        left = currentMouseX + flip;
        top = currentMouseY - cardHeight / 2;
        arrowClass = "kb-arrow kb-arrow-left"; arrowPos = { side: "left" };
      } else if (zone === "top-center") {
        left = currentMouseX - cardWidth / 2;
        top = currentMouseY - cardHeight - flip;
        arrowClass = "kb-arrow kb-arrow-bottom"; arrowPos = { side: "bottom" };
      } else if (zone === "bottom-center") {
        left = currentMouseX - cardWidth / 2;
        top = currentMouseY + flip;
        // Unterkante: Item nah am Fensterrand → Card oberhalb des Cursors
        // Kein 40er-Boden: Lookahead und Clamp danach regeln den Rest, sonst bricht die 32er-Lücke
        if (top + cardHeight > viewportHeight - padding) {
          top = currentMouseY - cardHeight - flip;
          stuckAbove = true;
        } else {
          stuckAbove = false;
        }
        arrowClass = "kb-arrow kb-arrow-top"; arrowPos = { side: "top" };
      } else if (zone === "top-left") {
        left = currentMouseX - cardWidth - flip;
        top = currentMouseY - cardHeight - flip;
        arrowClass = "kb-arrow kb-arrow-bottom-right"; arrowPos = { side: "custom", style: { right: "16px", bottom: "-6px", top: "auto", left: "auto", transform: "rotate(135deg)" } };
      } else if (zone === "top-right") {
        left = currentMouseX + flip;
        top = currentMouseY - cardHeight - flip;
        arrowClass = "kb-arrow kb-arrow-bottom-left"; arrowPos = { side: "custom", style: { left: "16px", bottom: "-6px", top: "auto", right: "auto", transform: "rotate(225deg)" } };
      } else if (zone === "bottom-left") {
        left = currentMouseX - cardWidth - flip;
        top = currentMouseY + flip;
        arrowClass = "kb-arrow kb-arrow-top-right"; arrowPos = { side: "custom", style: { right: "16px", top: "-6px", bottom: "auto", left: "auto", transform: "rotate(45deg)" } };
      } else if (zone === "bottom-right") {
        left = currentMouseX + flip;
        top = currentMouseY + flip;
        arrowClass = "kb-arrow kb-arrow-top-left"; arrowPos = { side: "custom", style: { left: "16px", top: "-6px", bottom: "auto", right: "auto", transform: "rotate(-45deg)" } };
      } else {
        left = r.right + flip;
        top = r.top + (r.height - cardHeight) / 2;
        arrowClass = "kb-arrow kb-arrow-left"; arrowPos = { side: "left" };
      }

      // Flip mit Lookahead: zuerst die Gegenseite (lässt den Mausweg frei),
      // nur wenn weder oben noch unten passt, seitlich ausweichen.
      // Flip Sub oder Main aus: kein Flip, nur Clamp danach
      if (modAn("kbModPositionFlip") && modAn("kbModPositioning") && (top < padding || top + cardHeight > viewportHeight - padding)) {
        const above = currentMouseY - cardHeight - flip;
        const below = currentMouseY + flip;
        const fitsAbove = above >= padding;
        const fitsBelow = below + cardHeight <= viewportHeight - padding;
        const flipSide = () => {
          top = currentMouseY - cardHeight / 2;
          left = (currentMouseX < viewportWidth / 2)
            ? currentMouseX + flip
            : currentMouseX - cardWidth - flip;
        };
        if (top < padding && fitsBelow) top = below;
        else if (top + cardHeight > viewportHeight - padding && fitsAbove) top = above;
        else if (fitsAbove) top = above;
        else if (fitsBelow) top = below;
        else { flipSide(); trackLog(`SEITENWECHSEL weder oben noch unten passt Zone=${zone}`, `sidenone|${zone}`); }
      }
      if (modAn("kbModPositionFlip") && modAn("kbModPositioning") && (left < padding || left + cardWidth > viewportWidth - padding)) {
        const leftPos = currentMouseX - cardWidth - flip;
        const rightPos = currentMouseX + flip;
        const fitsLeft = leftPos >= padding;
        const fitsRight = rightPos + cardWidth <= viewportWidth - padding;
        if (left < padding && fitsRight) left = rightPos;
        else if (left + cardWidth > viewportWidth - padding && fitsLeft) left = leftPos;
        else if (fitsLeft) left = leftPos;
        else if (fitsRight) left = rightPos;
      }
      // clamp to viewport, Dreieck bleibt an Card
      // Clamp Sub aus: keine Kanten Begrenzung
      if (modAn("kbModPositionClamp")) {
        left = Math.max(padding, Math.min(left, viewportWidth - cardWidth - padding));
        top = Math.max(padding, Math.min(top, viewportHeight - cardHeight - padding));
      }
      // Voraus und Ruder Subs: Versatz entlang oder gegen die Bewegungsrichtung
      // Ruder kehrt um wie Ruder gegen Boot, Voraus eilt voraus
      let lenkX = 0;
      let lenkY = 0;
      if (modAn("kbModPositionVoraus")) {
        lenkX = bewegX;
        lenkY = bewegY;
      }
      if (modAn("kbModPositionRuder")) {
        lenkX = -lenkX;
        lenkY = -lenkY;
      }
      const lenkLang = Math.hypot(lenkX, lenkY);
      if (lenkLang > 0.3) {
        left += (lenkX / lenkLang) * 24;
        top += (lenkY / lenkLang) * 24;
      }
      // Universelles Koordinaten-Log: Card-Box + Spitze vs. Cursor + Pfad
      const itemKey = Math.round(r.top);
      if (zone !== lastZoneLogged || itemKey !== lastItemTopLogged) {
        trackLog(`WECHSEL von ${(lastZoneLogged || "keine")} nach ${zone} TrefferOberkante=${itemKey} MausHoehe=${Math.round(currentMouseY)}`, `trans|${zone}|${itemKey}`);
        lastZoneLogged = zone;
        lastItemTopLogged = itemKey;
      }
      let tipX = -1, tipY = -1;
      if (showTrackLog) {
        const arrowEl = previewCard.querySelector("#kb-arrow");
        if (arrowEl) {
          const ar = arrowEl.getBoundingClientRect();
          tipX = Math.round(ar.left + ar.width / 2);
          tipY = Math.round(ar.top + ar.height / 2);
        }
      }
      const cardBottom = top + cardHeight;
      // Lage der Preview-Card zum Mauszeiger und Verankerung an der Viewport-Kante
      const lage = cardBottom <= currentMouseY ? "oberhalb" : (top >= currentMouseY ? "unterhalb" : "seitlich");
      const anschlag = top <= padding + 0.5 ? "oben" : (top >= viewportHeight - cardHeight - padding - 0.5 ? "unten" : "keiner");
      // Korridor-Metrik: wie viel Pixel der Preview-Card das Vertikalband (+-20 um die Maus) oben/unten verdecken
      const korridorLinks = currentMouseX - 20;
      const korridorRechts = currentMouseX + 20;
      const waagrechteUeberlappung = Math.max(0, Math.min(left + cardWidth, korridorRechts) - Math.max(left, korridorLinks));
      const korridorOben = waagrechteUeberlappung > 0 ? Math.round(Math.max(0, Math.min(cardBottom, currentMouseY) - Math.max(top, 0))) : 0;
      const korridorUnten = waagrechteUeberlappung > 0 ? Math.round(Math.max(0, Math.min(cardBottom, viewportHeight) - Math.max(top, currentMouseY))) : 0;
      const richtung = trackDir > 0 ? "runter" : (trackDir < 0 ? "hoch" : "steht");
      trackLog(`Zone=${zone} Maus=(${Math.round(currentMouseX)},${Math.round(currentMouseY)}) PreviewCard=(links ${Math.round(left)} oben ${Math.round(top)} breite ${Math.round(cardWidth)} hoehe ${Math.round(cardHeight)}) Spitze=(${tipX},${tipY}) Luecke=${Math.round(currentMouseY - cardBottom)} Richtung=${richtung} Tempo=${trackSpd.toFixed(2)} Lage=${lage} Anschlag=${anschlag} KorridorOben=${korridorOben} KorridorUnten=${korridorUnten} Treffer=(oben ${itemKey} hoehe ${Math.round(r.height)}) Festgehalten=${stuckAbove ? "an" : "aus"} InKarte=${mouseInCard ? "ja" : "nein"}`, `pos|${zone}`);
    } else {
      // fallback mouse-based (loading)
      left = currentMouseX + padding;
      top = currentMouseY + padding;
      if (left + cardWidth > viewportWidth - padding) left = currentMouseX - cardWidth - padding;
      if (top + cardHeight > viewportHeight - padding) top = viewportHeight - cardHeight - padding;
      left = Math.max(padding, Math.min(left, viewportWidth - cardWidth - padding));
      top = Math.max(padding, Math.min(top, viewportHeight - cardHeight - padding));
      arrowClass = left < currentMouseX ? "kb-arrow kb-arrow-right" : "kb-arrow kb-arrow-left";
      arrowPos = { side: left < currentMouseX ? "right" : "left" };
    }

    previewCard.style.top = `${Math.round(top)}px`;
    previewCard.style.left = `${Math.round(left)}px`;

    const arrow = previewCard.querySelector("#kb-arrow");
    if (arrow && modAn("kbModArrow")) {
      // Seite aus echter Geometrie nach Clamp bestimmen, nicht aus Entry-Zone:
      // Spitze zeigt stets auf den Mauszeiger.
      // Geometrie Sub aus: nur vier Seiten, keine Ecken Fälle
      const fein = modAn("kbModArrowGeometrie");
      const mx = currentMouseX, my = currentMouseY;
      const cardH = previewCard.offsetHeight || cardHeight;
      const R = left + cardWidth, B = top + cardH;
      const leftOf = mx < left, rightOf = mx > R;
      const above = my < top, below = my > B;
      let s = null;
      if (leftOf && !above && !below) {
        s = { cls: "kb-arrow kb-arrow-left", top: `${Math.round(Math.max(16, Math.min(my - top, cardH - 16)))}px` };
      } else if (rightOf && !above && !below) {
        s = { cls: "kb-arrow kb-arrow-right", top: `${Math.round(Math.max(16, Math.min(my - top, cardH - 16)))}px` };
      } else if (above && !leftOf && !rightOf) {
        s = { cls: "kb-arrow kb-arrow-top", left: `${Math.round(Math.max(16, Math.min(mx - left, cardWidth - 16)))}px` };
      } else if (below && !leftOf && !rightOf) {
        s = { cls: "kb-arrow kb-arrow-bottom", left: `${Math.round(Math.max(16, Math.min(mx - left, cardWidth - 16)))}px` };
      } else if (leftOf && above && fein) {
        s = { cls: "kb-arrow", style: { left: `${Math.round(Math.max(16, Math.min(mx - left + 24, cardWidth - 16)))}px`, top: "-6px", bottom: "auto", right: "auto", transform: "rotate(45deg)" } };
      } else if (rightOf && above && fein) {
        s = { cls: "kb-arrow", style: { left: `${Math.round(Math.max(16, Math.min(mx - left - 24, cardWidth - 16)))}px`, top: "-6px", bottom: "auto", right: "auto", transform: "rotate(45deg)" } };
      } else if (leftOf && below && fein) {
        s = { cls: "kb-arrow", style: { left: `${Math.round(Math.max(16, Math.min(mx - left + 24, cardWidth - 16)))}px`, bottom: "-6px", top: "auto", right: "auto", transform: "rotate(225deg)" } };
      } else if (rightOf && below && fein) {
        s = { cls: "kb-arrow", style: { left: `${Math.round(Math.max(16, Math.min(mx - left - 24, cardWidth - 16)))}px`, bottom: "-6px", top: "auto", right: "auto", transform: "rotate(225deg)" } };
      } else {
        // Maus überlappt Card (nach Clamp): nächste Kante nehmen
        const dL = Math.abs(mx - left), dR = Math.abs(mx - R);
        const dT = Math.abs(my - top), dB = Math.abs(my - B);
        const m = Math.min(dL, dR, dT, dB);
        if (m === dL) s = { cls: "kb-arrow kb-arrow-left", top: `${Math.round(Math.max(16, Math.min(my - top, cardH - 16)))}px` };
        else if (m === dR) s = { cls: "kb-arrow kb-arrow-right", top: `${Math.round(Math.max(16, Math.min(my - top, cardH - 16)))}px` };
        else if (m === dT) s = { cls: "kb-arrow kb-arrow-top", left: `${Math.round(Math.max(16, Math.min(mx - left, cardWidth - 16)))}px` };
        else s = { cls: "kb-arrow kb-arrow-bottom", left: `${Math.round(Math.max(16, Math.min(mx - left, cardWidth - 16)))}px` };
      }
      arrow.className = s.cls;
      arrow.style.top = "";
      arrow.style.bottom = "";
      arrow.style.left = "";
      arrow.style.right = "";
      arrow.style.transform = "";
      if (s.top) arrow.style.top = s.top;
      if (s.left) arrow.style.left = s.left;
      if (s.style) Object.assign(arrow.style, s.style);
    }
  }

  function attachHoverListeners() {
    const adItems = document.querySelectorAll("li.relative.mb-xsmall");

    adItems.forEach((item) => {
      if (item.dataset.kbBound) return;
      item.dataset.kbBound = "true";

      item.addEventListener("mouseenter", (e) => {
        const linkEl = item.querySelector("a[href*='/s-anzeige/']");
        if (!linkEl) return;
        itemHover = true;
        stuckAbove = false;
        // Hysterese Merker und Voraus Richtung je Treffer frisch starten
        lastCol = -1;
        lastRow = -1;
        bewegX = 0;
        bewegY = 0;
        // Erste Berührung: ab hier laufen die Anzeigen (Start Häkchen aus = bis hier aus)
        if (!startAktiv) {
          startAktiv = true;
          applyDebugUi();
        }

        const url = linkEl.href;

        const titleEl = item.querySelector("h3 a[href*='/s-anzeige/']");
        const title = titleEl ? titleEl.textContent.trim() : linkEl.textContent.trim();

        const priceEl = item.querySelector("p[class*='text-title'], [class*='font-bold'], [class*='price']");
        const price = priceEl ? priceEl.textContent.trim() : "";
        currentItemRect = item.getBoundingClientRect();
        currentMouseX = e.clientX;
        currentMouseY = e.clientY;

        hoverTimeout = setTimeout(async () => {
          if (!isExtensionAlive()) return;
          previewCard.innerHTML = `<div class="kb-loading">Lade Vorschau...</div>`;
          previewCard.classList.remove("kb-card-hidden");
          positionCardAtCursor();

          const data = await fetchAdDetails(url);
          if (!isExtensionAlive()) return;
          if (data) {
            renderCardContent(data, title, price, url);
            positionCardAtCursor();
          }
        }, 300);
      });

      item.addEventListener("mouseleave", () => {
        clearTimeout(hoverTimeout);
        itemHover = false;
        stuckAbove = false;
      });
    });
  }

  document.addEventListener("click", (e) => {
    if (!previewCard.contains(e.target) && !e.target.closest("li.relative.mb-xsmall")) {
      previewCard.classList.add("kb-card-hidden");
      updateDebugOverlay();
    }
  });

  // Hover an alle Treffer binden, danach DOM-Änderungen weiter beobachten
  attachHoverListeners();

  const observer = new MutationObserver(() => {
  attachHoverListeners();

  // Debug-Toggles initial an (außer Transparent): einmalig anwenden
  updateItemLabels();
  updateClampOverlay();
  updateItemHighlight();
    updateItemLabels();
  });

  observer.observe(document.body, { childList: true, subtree: true });
})();
