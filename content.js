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
  // Gemerkte Spalte/Reihe für Zonen-Hysterese (kein Flattern an Grenzen)
  let lastCol = -1;
  let lastRow = -1;
  let lastMove = { x: 0, y: 0, t: 0 };
  let showItemLabels = true;
  let showClampZone = true;
  let showItemHighlight = true;
  let showTrackLog = true;
  let lastTrackLog = 0;
  let lastTrackSig = "";
  let lastZoneLogged = null;
  let lastItemTopLogged = 0;
  let trackDir = 0;
  let trackSpd = 0;
  let stuckAbove = false;

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
      if (showItemLabels) {
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

  // Zonenband mit Hysterese: Wechsel erst nach 5 Prozent Übertritt (kein Flattern)
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
    lastCol = zoneBand(relX, lastCol);
    lastRow = zoneBand(relY, lastRow);
    return ZONE_MAP[lastRow][lastCol];
  }

  function updateDebugOverlay() {
    if (!debugOverlay) return;
    if (!showDebugZones || !currentItemRect || previewCard.classList.contains("kb-card-hidden")) {
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
    clampOverlay.style.display = showClampZone ? "block" : "none";
  }

  function updateItemHighlight() {
    document.body.classList.toggle("kb-highlight-items", showItemHighlight);
  }

    const KB_SWATCHES = [
    { id: "standard", name: "Standard", mode: "light", bg: "#fdfbff", border: "#e1e2ec", text: "#191c1e", textMuted: "#44474f", imgBg: "#e1e2ec", btnPrimary: "#4c662b", btnPrimaryText: "#ffffff", btnSecondary: "#0061a4", btnSecondaryText: "#ffffff" },
    { id: "nebel", name: "Nebel", mode: "light", bg: "#f8fafc", border: "#e2e8f0", text: "#334155", textMuted: "#64748b", imgBg: "#f1f5f9", btnPrimary: "#475569", btnPrimaryText: "#ffffff", btnSecondary: "#64748b", btnSecondaryText: "#ffffff" },
    { id: "sand", name: "Sand", mode: "light", bg: "#fefce8", border: "#fef08a", text: "#713f12", textMuted: "#854d0e", imgBg: "#fef9c3", btnPrimary: "#ca8a04", btnPrimaryText: "#ffffff", btnSecondary: "#eab308", btnSecondaryText: "#713f12" },
    { id: "wald", name: "Wald", mode: "light", bg: "#f0fdf4", border: "#bbf7d0", text: "#14532d", textMuted: "#166534", imgBg: "#dcfce7", btnPrimary: "#15803d", btnPrimaryText: "#ffffff", btnSecondary: "#65a30d", btnSecondaryText: "#ffffff" },
    { id: "ozean", name: "Ozean", mode: "light", bg: "#eff6ff", border: "#bfdbfe", text: "#1e3a8a", textMuted: "#1e40af", imgBg: "#dbeafe", btnPrimary: "#2563eb", btnPrimaryText: "#ffffff", btnSecondary: "#0ea5e9", btnSecondaryText: "#ffffff" },
    { id: "koralle", name: "Koralle", mode: "light", bg: "#fff7ed", border: "#fed7aa", text: "#7c2d12", textMuted: "#9a3412", imgBg: "#ffedd5", btnPrimary: "#f97316", btnPrimaryText: "#ffffff", btnSecondary: "#fb923c", btnSecondaryText: "#ffffff" },
    { id: "lavendel", name: "Lavendel", mode: "light", bg: "#faf5ff", border: "#e9d5ff", text: "#581c87", textMuted: "#6b21a8", imgBg: "#f3e8ff", btnPrimary: "#9333ea", btnPrimaryText: "#ffffff", btnSecondary: "#a855f7", btnSecondaryText: "#ffffff" },
    { id: "sonne", name: "Sonne", mode: "light", bg: "#fffbeb", border: "#fde68a", text: "#92400e", textMuted: "#b45309", imgBg: "#fef3c7", btnPrimary: "#d97706", btnPrimaryText: "#ffffff", btnSecondary: "#ea580c", btnSecondaryText: "#ffffff" },
    { id: "kirsche", name: "Kirsche", mode: "light", bg: "#fef2f2", border: "#fecaca", text: "#7f1d1d", textMuted: "#991b1b", imgBg: "#fee2e2", btnPrimary: "#dc2626", btnPrimaryText: "#ffffff", btnSecondary: "#be123c", btnSecondaryText: "#ffffff" },
    { id: "bluete", name: "Blüte", mode: "light", bg: "#fdf2f8", border: "#fbcfe8", text: "#831843", textMuted: "#9d174d", imgBg: "#fce7f3", btnPrimary: "#db2777", btnPrimaryText: "#ffffff", btnSecondary: "#ec4899", btnSecondaryText: "#ffffff" },
    { id: "aqua", name: "Aqua", mode: "light", bg: "#ecfeff", border: "#a5f3fc", text: "#155e75", textMuted: "#0e7490", imgBg: "#cffafe", btnPrimary: "#0891b2", btnPrimaryText: "#ffffff", btnSecondary: "#06b6d4", btnSecondaryText: "#ffffff" },
    { id: "flamme", name: "Flamme", mode: "light", bg: "#fff1f2", border: "#fecdd3", text: "#881337", textMuted: "#9f1239", imgBg: "#ffe4e6", btnPrimary: "#e11d48", btnPrimaryText: "#ffffff", btnSecondary: "#f43f5e", btnSecondaryText: "#ffffff" },
    { id: "sturm", name: "Sturm", mode: "light", bg: "#f4f4f5", border: "#d4d4d8", text: "#27272a", textMuted: "#52525b", imgBg: "#e4e4e7", btnPrimary: "#18181b", btnPrimaryText: "#ffffff", btnSecondary: "#3f3f46", btnSecondaryText: "#ffffff" },
    { id: "honig", name: "Honig", mode: "light", bg: "#fefce8", border: "#fde68a", text: "#7c2d12", textMuted: "#92400e", imgBg: "#fef3c7", btnPrimary: "#f59e0b", btnPrimaryText: "#ffffff", btnSecondary: "#fbbf24", btnSecondaryText: "#7c2d12" },
    { id: "eis", name: "Eis", mode: "light", bg: "#f0f9ff", border: "#bae6fd", text: "#0c4a6e", textMuted: "#075985", imgBg: "#e0f2fe", btnPrimary: "#0284c7", btnPrimaryText: "#ffffff", btnSecondary: "#0ea5e9", btnSecondaryText: "#ffffff" },
    { id: "pfirsich", name: "Pfirsich", mode: "light", bg: "#fff7ed", border: "#ffedd5", text: "#431407", textMuted: "#9a3412", imgBg: "#ffedd5", btnPrimary: "#ea580c", btnPrimaryText: "#ffffff", btnSecondary: "#f97316", btnSecondaryText: "#ffffff" },
    { id: "minze", name: "Minze", mode: "light", bg: "#ecfdf5", border: "#a7f3d0", text: "#022c22", textMuted: "#065f46", imgBg: "#d1fae5", btnPrimary: "#059669", btnPrimaryText: "#ffffff", btnSecondary: "#10b981", btnSecondaryText: "#ffffff" },
    { id: "flieder", name: "Flieder", mode: "light", bg: "#f5f3ff", border: "#ddd6fe", text: "#4c1d95", textMuted: "#5b21b6", imgBg: "#ede9fe", btnPrimary: "#7c3aed", btnPrimaryText: "#ffffff", btnSecondary: "#8b5cf6", btnSecondaryText: "#ffffff" },
    { id: "creme", name: "Creme", mode: "light", bg: "#fefce8", border: "#fde68a", text: "#422006", textMuted: "#78350f", imgBg: "#fef9c3", btnPrimary: "#a16207", btnPrimaryText: "#ffffff", btnSecondary: "#ca8a04", btnSecondaryText: "#ffffff" },
    { id: "eisblau", name: "Eisblau", mode: "light", bg: "#f0f9ff", border: "#7dd3fc", text: "#0c4a6e", textMuted: "#0369a1", imgBg: "#e0f2fe", btnPrimary: "#0284c7", btnPrimaryText: "#ffffff", btnSecondary: "#38bdf8", btnSecondaryText: "#ffffff" },
    { id: "pfirsichhell", name: "Pfirsich Hell", mode: "light", bg: "#fef7ed", border: "#fdba74", text: "#431407", textMuted: "#9a3412", imgBg: "#ffedd5", btnPrimary: "#f97316", btnPrimaryText: "#ffffff", btnSecondary: "#fb923c", btnSecondaryText: "#ffffff" },
    { id: "minzhell", name: "Minz Hell", mode: "light", bg: "#f0fdf4", border: "#86efac", text: "#14532d", textMuted: "#166534", imgBg: "#dcfce7", btnPrimary: "#22c55e", btnPrimaryText: "#ffffff", btnSecondary: "#4ade80", btnSecondaryText: "#14532d" },
    { id: "fliederhell", name: "Flieder Hell", mode: "light", bg: "#faf5ff", border: "#d8b4fe", text: "#6b21a8", textMuted: "#7e22ce", imgBg: "#f3e8ff", btnPrimary: "#a855f7", btnPrimaryText: "#ffffff", btnSecondary: "#c084fc", btnSecondaryText: "#ffffff" },
    { id: "cremehell", name: "Creme Hell", mode: "light", bg: "#fffbeb", border: "#fde68a", text: "#78350f", textMuted: "#92400e", imgBg: "#fef3c7", btnPrimary: "#eab308", btnPrimaryText: "#78350f", btnSecondary: "#facc15", btnSecondaryText: "#78350f" },
    { id: "midnight", name: "Mitternacht", mode: "dark", bg: "#0f172a", border: "#334155", text: "#f1f5f9", textMuted: "#94a3b8", imgBg: "#1e293b", btnPrimary: "#38bdf8", btnPrimaryText: "#0f172a", btnSecondary: "#818cf8", btnSecondaryText: "#ffffff" },
    { id: "dunkelgruen", name: "Dunkelgrün", mode: "dark", bg: "#022c22", border: "#064e3b", text: "#ecfdf5", textMuted: "#6ee7b7", imgBg: "#064e3b", btnPrimary: "#10b981", btnPrimaryText: "#022c22", btnSecondary: "#059669", btnSecondaryText: "#ffffff" },
    { id: "graphit", name: "Graphit", mode: "dark", bg: "#18181b", border: "#27272a", text: "#f4f4f5", textMuted: "#a1a1aa", imgBg: "#27272a", btnPrimary: "#71717a", btnPrimaryText: "#ffffff", btnSecondary: "#52525b", btnSecondaryText: "#ffffff" },
    { id: "tundra", name: "Tundra", mode: "dark", bg: "#1e293b", border: "#334155", text: "#e2e8f0", textMuted: "#94a3b8", imgBg: "#0f172a", btnPrimary: "#0f766e", btnPrimaryText: "#ffffff", btnSecondary: "#14b8a6", btnSecondaryText: "#ffffff" },
    { id: "wueste", name: "Wüste", mode: "dark", bg: "#1c1917", border: "#44403c", text: "#f5f5f4", textMuted: "#a8a29e", imgBg: "#292524", btnPrimary: "#a21caf", btnPrimaryText: "#ffffff", btnSecondary: "#c026d3", btnSecondaryText: "#ffffff" },
    { id: "nacht", name: "Nacht", mode: "dark", bg: "#020617", border: "#1e293b", text: "#e2e8f0", textMuted: "#94a3b8", imgBg: "#0f172a", btnPrimary: "#6366f1", btnPrimaryText: "#ffffff", btnSecondary: "#8b5cf6", btnSecondaryText: "#ffffff" },
    { id: "obsidian", name: "Obsidian", mode: "dark", bg: "#0c0a09", border: "#44403c", text: "#f5f5f4", textMuted: "#a8a29e", imgBg: "#1c1917", btnPrimary: "#57534e", btnPrimaryText: "#ffffff", btnSecondary: "#78716c", btnSecondaryText: "#ffffff" },
    { id: "tiefsee", name: "Tiefsee", mode: "dark", bg: "#082f49", border: "#0c4a6e", text: "#e0f2fe", textMuted: "#7dd3fc", imgBg: "#0c4a6e", btnPrimary: "#0ea5e9", btnPrimaryText: "#ffffff", btnSecondary: "#38bdf8", btnSecondaryText: "#ffffff" },
    { id: "waldnacht", name: "Waldnacht", mode: "dark", bg: "#052e16", border: "#14532d", text: "#dcfce7", textMuted: "#86efac", imgBg: "#14532d", btnPrimary: "#22c55e", btnPrimaryText: "#052e16", btnSecondary: "#16a34a", btnSecondaryText: "#ffffff" },
    { id: "lavanacht", name: "Lavanacht", mode: "dark", bg: "#2e1065", border: "#4c1d95", text: "#f5f3ff", textMuted: "#ddd6fe", imgBg: "#4c1d95", btnPrimary: "#8b5cf6", btnPrimaryText: "#ffffff", btnSecondary: "#a78bfa", btnSecondaryText: "#ffffff" },
    { id: "kirschdunkel", name: "Kirschdunkel", mode: "dark", bg: "#450a0a", border: "#7f1d1d", text: "#fee2e2", textMuted: "#fecaca", imgBg: "#7f1d1d", btnPrimary: "#f43f5e", btnPrimaryText: "#ffffff", btnSecondary: "#e11d48", btnSecondaryText: "#ffffff" },
    { id: "bernstein", name: "Bernstein", mode: "dark", bg: "#451a03", border: "#7c2d12", text: "#fef3c7", textMuted: "#fde68a", imgBg: "#7c2d12", btnPrimary: "#f59e0b", btnPrimaryText: "#451a03", btnSecondary: "#fbbf24", btnSecondaryText: "#451a03" },
    { id: "obsidian2", name: "Obsidian 2", mode: "dark", bg: "#09090b", border: "#27272a", text: "#fafafa", textMuted: "#a1a1aa", imgBg: "#18181b", btnPrimary: "#52525b", btnPrimaryText: "#ffffff", btnSecondary: "#71717a", btnSecondaryText: "#ffffff" },
    { id: "tiefsee2", name: "Tiefsee 2", mode: "dark", bg: "#0c4a6e", border: "#075985", text: "#e0f2fe", textMuted: "#bae6fd", imgBg: "#075985", btnPrimary: "#0284c7", btnPrimaryText: "#ffffff", btnSecondary: "#0ea5e9", btnSecondaryText: "#ffffff" },
    { id: "moos2", name: "Moos 2", mode: "dark", bg: "#052e16", border: "#166534", text: "#dcfce7", textMuted: "#86efac", imgBg: "#14532d", btnPrimary: "#16a34a", btnPrimaryText: "#ffffff", btnSecondary: "#22c55e", btnSecondaryText: "#052e16" },
    { id: "kohle2", name: "Kohle 2", mode: "dark", bg: "#1c1917", border: "#44403c", text: "#f5f5f4", textMuted: "#a8a29e", imgBg: "#292524", btnPrimary: "#57534e", btnPrimaryText: "#ffffff", btnSecondary: "#78716c", btnSecondaryText: "#ffffff" },
    { id: "schiefer", name: "Schiefer", mode: "dark", bg: "#27272a", border: "#3f3f46", text: "#f4f4f5", textMuted: "#a1a1aa", imgBg: "#3f3f46", btnPrimary: "#52525b", btnPrimaryText: "#ffffff", btnSecondary: "#71717a", btnSecondaryText: "#ffffff" },
    { id: "tinte", name: "Tinte", mode: "dark", bg: "#1e1b4b", border: "#4338ca", text: "#e0e7ff", textMuted: "#a5b4fc", imgBg: "#312e81", btnPrimary: "#6366f1", btnPrimaryText: "#ffffff", btnSecondary: "#818cf8", btnSecondaryText: "#ffffff" },
    { id: "moor", name: "Moor", mode: "dark", bg: "#1c1917", border: "#57534e", text: "#f5f5f4", textMuted: "#a8a29e", imgBg: "#44403c", btnPrimary: "#78716c", btnPrimaryText: "#ffffff", btnSecondary: "#a8a29e", btnSecondaryText: "#1c1917" },
    { id: "abyss", name: "Abyss", mode: "dark", bg: "#020617", border: "#334155", text: "#f1f5f9", textMuted: "#94a3b8", imgBg: "#0f172a", btnPrimary: "#0ea5e9", btnPrimaryText: "#ffffff", btnSecondary: "#38bdf8", btnSecondaryText: "#ffffff" },
    { id: "ember", name: "Glut", mode: "dark", bg: "#450a0a", border: "#991b1b", text: "#fee2e2", textMuted: "#fecaca", imgBg: "#7f1d1d", btnPrimary: "#ef4444", btnPrimaryText: "#ffffff", btnSecondary: "#f87171", btnSecondaryText: "#450a0a" },
    { id: "nebel2", name: "Nebel 2", mode: "dark", bg: "#0f172a", border: "#475569", text: "#e2e8f0", textMuted: "#94a3b8", imgBg: "#1e293b", btnPrimary: "#64748b", btnPrimaryText: "#ffffff", btnSecondary: "#94a3b8", btnSecondaryText: "#0f172a" },
    { id: "wald2", name: "Wald 2", mode: "dark", bg: "#052e16", border: "#15803d", text: "#bbf7d0", textMuted: "#86efac", imgBg: "#166534", btnPrimary: "#22c55e", btnPrimaryText: "#052e16", btnSecondary: "#4ade80", btnSecondaryText: "#052e16" },
    { id: "ozean2", name: "Ozean 2", mode: "dark", bg: "#0c4a6e", border: "#0284c7", text: "#e0f2fe", textMuted: "#7dd3fc", imgBg: "#075985", btnPrimary: "#0ea5e9", btnPrimaryText: "#ffffff", btnSecondary: "#38bdf8", btnSecondaryText: "#0c4a6e" },

  ];

  function applySwatchTheme(id) {
    const s = KB_SWATCHES.find((x) => x.id === id);
    if (!s) return;
    previewCard.style.setProperty("--kb-bg", s.bg);
    previewCard.style.setProperty("--kb-border", s.border);
    previewCard.style.setProperty("--kb-text-main", s.text);
    previewCard.style.setProperty("--kb-text-title", s.text);
    previewCard.style.setProperty("--kb-text-muted", s.textMuted);
    previewCard.style.setProperty("--kb-text-desc", s.textMuted);
    previewCard.style.setProperty("--kb-img-bg", s.imgBg);
    previewCard.style.setProperty("--kb-btn-primary-bg", s.btnPrimary);
    previewCard.style.setProperty("--kb-btn-primary-text", s.btnPrimaryText);
    previewCard.style.setProperty("--kb-btn-secondary-bg", s.btnSecondary);
    previewCard.style.setProperty("--kb-btn-secondary-text", s.btnSecondaryText);
    // update arrow bg/border to match
    const arrow = previewCard.querySelector("#kb-arrow");
    if (arrow) {
      arrow.style.background = s.bg;
      arrow.style.borderLeftColor = s.border;
      arrow.style.borderTopColor = s.border;
    }
    previewCard.querySelectorAll(".kb-swatch").forEach((el) => el.classList.toggle("kb-active", el.dataset.theme === id));
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
      if (area === "local" && changes.kbHomeLocation) {
        currentHomeLocation = changes.kbHomeLocation.newValue || "";
      }
      if (area === "local" && changes.kbSwatchTheme) {
        chrome.storage.local.get(["kbThemeModuleEnabled"], (r2) => {
          if (r2.kbThemeModuleEnabled !== false) applySwatchTheme(changes.kbSwatchTheme.newValue);
        });
      }
      if (area === "local" && changes.kbThemeModuleEnabled) {
        const drawerEl = previewCard.querySelector("#kb-swatches-drawer");
        if (changes.kbThemeModuleEnabled.newValue === false) {
          applySwatchTheme("standard");
          if (drawerEl) drawerEl.style.display = "none";
        } else {
          if (drawerEl) drawerEl.style.display = "";
          chrome.storage.local.get(["kbSwatchTheme"], (r2) => {
            if (r2.kbSwatchTheme) applySwatchTheme(r2.kbSwatchTheme);
          });
        }
      }
    });
    // Popup Theme-Modul: initial swatch anwenden
    chrome.storage.local.get(["kbSwatchTheme", "kbThemeModuleEnabled"], (r) => {
      if (r.kbThemeModuleEnabled !== false && r.kbSwatchTheme) {
        // delay until previewCard exists
        setTimeout(() => applySwatchTheme(r.kbSwatchTheme), 500);
      }
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
  new ResizeObserver(() => {
    if (shouldTrack(0)) positionCardAtCursor();
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

  // DOM-Ringpuffer als Console-Spiegel (für MCP-Auslesung)
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
    trackLog(`PROBLEM Karten-Eintritt Maus=(${Math.round(currentMouseX)},${Math.round(currentMouseY)}) Zone=${r ? currentZone() : "keine"} KartenOberkante=${previewCard.offsetTop} Kartenhoehe=${previewCard.offsetHeight} ImTreffer=${inItem ? "ja" : "nein"} TrefferAktiv=${itemHover ? "ja" : "nein"}`);
  });
  previewCard.addEventListener("mouseleave", () => { mouseInCard = false; });

  // Tracking-Bedingung, gemeinsam für Mousemove + ResizeObserver:
  // Freeze nur außerhalb des Items (echte Card-Interaktion). Solange der Cursor
  // über dem geho hoverten Item reist (auch geometrisch in der überlappenden Card),
  // flieht die Card weiter vor dem Cursor; zügige Durchfahrt ebenso.
  // Debug-Protokoll: gedrosselt in Console und DOM-Ringpuffer schreiben
  function trackLog(msg, sig) {
    if (!showTrackLog) return;
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
    if (!mouseInCard) return true;
    const r = currentItemRect;
    if (currentMouseX >= r.left && currentMouseX <= r.right && currentMouseY >= r.top && currentMouseY <= r.bottom) return true;
    if (speed > 0.25) return true;
    trackLog(`STARRE Maus in Karte ausserhalb Treffer Tempo=${speed.toFixed(2)}`, "freeze");
    return false;
  }

  // Mausverfolgung: Card bei jedem Zug neu positionieren, solange Tracking erlaubt ist
  document.addEventListener("mousemove", (e) => {
    const now = performance.now();
    const dt = now - (lastMove.t || now);
    const speed = dt > 0 ? Math.hypot(e.clientX - lastMove.x, e.clientY - lastMove.y) / dt : 0; // px pro ms
    const dyMove = e.clientY - lastMove.y;
    trackDir = dyMove === 0 ? 0 : (dyMove > 0 ? 1 : -1);
    trackSpd = speed;
    lastMove = { x: e.clientX, y: e.clientY, t: now };
    currentMouseX = e.clientX;
    currentMouseY = e.clientY;
    if (showMouseMarker && mouseMarker) {
      mouseMarker.style.display = "block";
      mouseMarker.style.left = `${e.clientX}px`;
      mouseMarker.style.top = `${e.clientY}px`;
    }
    if (shouldTrack(speed)) {
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

  // Karteninhalt aufbauen und alle Schalter in der Card verdrahten
  function renderCardContent(data, title, price, url) {
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

    const zoomLevels = ["1.5x", "2.0x", "2.5x", "3.0x", "4.0x"];

    previewCard.innerHTML = `
      <div class="kb-arrow" id="kb-arrow"></div>
      <div class="kb-image-container" id="kb-img-container">
        ${
          hasImages
            ? `<img src="${data.images[0]}" class="kb-main-img" id="kb-img-element" />`
            : `<div class="kb-no-img">Kein Bild vorhanden</div>`
        }
        ${
          hasImages
            ? `<button class="kb-rotate-btn" aria-label="Bild drehen">
                 <svg viewBox="0 0 24 24">
                   <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
                 </svg>
               </button>`
            : ""
        }
        ${
          hasImages
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
        <span class="kb-price">${price}</span>
      </div>
      <div class="kb-details">
        <p class="kb-location">
          <svg class="kb-location-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="var(--kb-text-muted)">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/>
          </svg>
          <span>${data.location}</span>
        </p>
        <div class="kb-description"></div>
      </div>
      <div class="kb-actions">
        <a href="${url}" target="_blank" rel="noopener noreferrer" class="kb-btn kb-btn-primary">Anzeige ansehen <svg class="kb-btn-icon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>
        <a href="${mapsUrl}" target="_blank" rel="noopener noreferrer" class="kb-btn kb-btn-secondary">Route planen</a>
      </div>
      <div class="kb-swatches-drawer" id="kb-swatches-drawer">
        <button class="kb-swatches-toggle" id="kb-swatches-toggle" aria-label="Farben umschalten"><span class="kb-toggle-dot"></span><span class="kb-toggle-dot"></span><span class="kb-toggle-dot"></span></button>
        <div class="kb-swatches-grid" id="kb-swatches-grid">
          ${["light","dark"].map((mode) => `
            <div class="kb-swatch-group">
              <div class="kb-swatch-label">${mode === "light" ? "Light" : "Dark"}</div>
              <div class="kb-swatches-subgrid">
                ${KB_SWATCHES.filter((s) => s.mode === mode).map((s) => `<button class="kb-swatch" data-theme="${s.id}" data-mode="${s.mode}" title="${s.name}" aria-label="${s.name}" style="background: linear-gradient(135deg, ${s.btnPrimary} 0%, ${s.btnSecondary} 100%); border-color:${s.border};"></button>`).join("")}
              </div>
            </div>
          `).join("")}
        </div>
      </div>
      <div class="kb-debug-row">
        <button class="kb-debug-toggle" id="kb-debug-toggle" aria-label="Zonen-Debug an/aus">Zonen</button>
        <button class="kb-debug-toggle" id="kb-transp-toggle" aria-label="Card transparent an/aus">Transparent</button>
        <button class="kb-debug-toggle" id="kb-mouse-toggle" aria-label="Maus-Marker an/aus">Maus</button>
        <button class="kb-debug-toggle" id="kb-labels-toggle" aria-label="Item-Buchstaben an/aus">ABC</button>
        <button class="kb-debug-toggle" id="kb-clamp-toggle" aria-label="Clamp-Zone an/aus">Clamp</button>
        <button class="kb-debug-toggle" id="kb-items-toggle" aria-label="Treffer-Items hervorheben an/aus">Items</button>
        <button class="kb-debug-toggle" id="kb-log-toggle" aria-label="Tracking-Log an/aus">Log</button>
        <button class="kb-debug-toggle" id="kb-all-toggle" aria-label="Alle Debug-Werkzeuge an/aus">Alle</button>
      </div>

    `;

    const descContainer = previewCard.querySelector(".kb-description");
    if (descContainer) {
      descContainer.textContent = data.description;
    }

    const imgContainer = previewCard.querySelector("#kb-img-container");
    const imgEl = previewCard.querySelector("#kb-img-element");

    let zoomControls = null;
    if (hasImages && imgEl) {
      zoomControls = setupZoomPan(imgContainer, imgEl);
    }

    if (hasImages && data.images.length > 1) {
      const counterEl = previewCard.querySelector(".kb-img-counter");

      previewCard.querySelector(".kb-prev").addEventListener("click", (e) => {
        e.stopPropagation();
        currentImgIdx = (currentImgIdx - 1 + data.images.length) % data.images.length;
        imgEl.src = data.images[currentImgIdx];
        counterEl.textContent = `${currentImgIdx + 1} / ${data.images.length}`;
        if (zoomControls) { zoomControls.resetRotation(); zoomControls.resetLock(); }
      });

      previewCard.querySelector(".kb-next").addEventListener("click", (e) => {
        e.stopPropagation();
        currentImgIdx = (currentImgIdx + 1) % data.images.length;
        imgEl.src = data.images[currentImgIdx];
        counterEl.textContent = `${currentImgIdx + 1} / ${data.images.length}`;
        if (zoomControls) { zoomControls.resetRotation(); zoomControls.resetLock(); }
      });
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
        transpToggle.classList.toggle("kb-active", on);
      });
    }

    const mouseToggle = previewCard.querySelector("#kb-mouse-toggle");
    if (mouseToggle) {
      mouseToggle.classList.toggle("kb-active", showMouseMarker);
      mouseToggle.addEventListener("click", (e) => {
        e.stopPropagation();
        showMouseMarker = !showMouseMarker;
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
        logToggle.classList.toggle("kb-active", showTrackLog);
        if (showTrackLog) console.log("[kb-track] PROTOKOLL AN");
        else { lastTrackSig = ""; console.log("[kb-track] PROTOKOLL AUS"); }
      });
    }

    // Hauptschalter: alle Debug-Werkzeuge auf einmal schalten (ohne Transparent)
    const allToggle = previewCard.querySelector("#kb-all-toggle");
    const syncDebugButtons = () => {
      const zustand = [
        ["#kb-debug-toggle", showDebugZones],
        ["#kb-mouse-toggle", showMouseMarker],
        ["#kb-labels-toggle", showItemLabels],
        ["#kb-clamp-toggle", showClampZone],
        ["#kb-items-toggle", showItemHighlight],
        ["#kb-log-toggle", showTrackLog],
      ];
      zustand.forEach(([selektor, an]) => {
        const knopf = previewCard.querySelector(selektor);
        if (knopf) knopf.classList.toggle("kb-active", an);
      });
      if (allToggle) {
        const alleAn = showDebugZones && showMouseMarker && showItemLabels && showClampZone && showItemHighlight && showTrackLog;
        allToggle.classList.toggle("kb-active", alleAn);
      }
    };
    if (allToggle) {
      syncDebugButtons();
      allToggle.addEventListener("click", (e) => {
        e.stopPropagation();
        const ziel = !(showDebugZones && showMouseMarker && showItemLabels && showClampZone && showItemHighlight && showTrackLog);
        showDebugZones = ziel;
        showMouseMarker = ziel;
        showItemLabels = ziel;
        showClampZone = ziel;
        showItemHighlight = ziel;
        showTrackLog = ziel;
        if (!ziel) lastTrackSig = "";
        if (mouseMarker) mouseMarker.style.display = showMouseMarker ? "block" : "none";
        updateDebugOverlay();
        updateItemLabels();
        updateClampOverlay();
        updateItemHighlight();
        syncDebugButtons();
      });
    }

    const drawer = previewCard.querySelector("#kb-swatches-drawer");
    const drawerToggle = previewCard.querySelector("#kb-swatches-toggle");
    if (drawer && drawerToggle) {
      drawerToggle.addEventListener("click", (e) => {
        e.stopPropagation();
        drawer.classList.toggle("kb-open");
      });
      previewCard.querySelectorAll(".kb-swatch").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          applySwatchTheme(btn.dataset.theme);
          if (typeof chrome !== "undefined" && chrome.storage) {
            chrome.storage.local.set({ kbSwatchTheme: btn.dataset.theme });
          }
        });
      });
      const applyDrawerVisibility = (enabled) => {
        drawer.style.display = enabled === false ? "none" : "";
      };
      if (typeof chrome !== "undefined" && chrome.storage) {
        chrome.storage.local.get(["kbThemeModuleEnabled", "kbSwatchTheme"], (r) => {
          applyDrawerVisibility(r.kbThemeModuleEnabled);
          if (r.kbThemeModuleEnabled !== false && r.kbSwatchTheme) applySwatchTheme(r.kbSwatchTheme);
        });
      }
    }
  }

  // Kern: Card-Position aus 3x3-Zone, Flip-Logik und Viewport-Clamp berechnen
  function positionCardAtCursor() {
    const cardWidth = 360;
    const cardHeight = previewCard.offsetHeight || 450;
    const padding = 15;
    // Flip-Abstand waagrecht/senkrecht und diagonal (Ecken: 32px Luftlinie)
    const flip = 32;
    const flipDiag = Math.round(flip / Math.SQRT2);
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
      lastCol = zoneBand(relX, lastCol);
      lastRow = zoneBand(relY, lastRow);
      const col = lastCol;
      const row = lastRow;
      const zoneMap = [
        ["top-left", "top-center", "top-right"],
        ["center-left", "center-center", "center-right"],
        ["bottom-left", "bottom-center", "bottom-right"],
      ];
      let zone = zoneMap[row][col];
      // Schmale (herausgefilterte) Items: Card immer seitlich, damit der vertikale Mausweg frei bleibt
      if (r.height < 60) {
        zone = currentMouseX < viewportWidth / 2 ? "center-right" : "center-left";
        trackLog(`SCHMALER-TREFFER Hoehe=${Math.round(r.height)} Zone=${zone}`, `narrow|${zone}`);
      }
      // Center-Spalte nie zentriert: Card seitlich, vertikaler Mausweg bleibt frei
      const sideLeft = currentMouseX < viewportWidth / 2 ? currentMouseX + flip : currentMouseX - cardWidth - flip;
      // Dreieck bleibt an Card (child), Card folgt Maus kontinuierlich
      if (zone === "center-center") {
        if (stuckAbove) {
          // Center-Spalte nie zentriert: seitlich versetzt, Korridor bleibt frei
          left = sideLeft;
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
        // Center-Spalte nie zentriert: seitlich versetzt, Korridor bleibt frei
        left = sideLeft;
        top = currentMouseY - cardHeight - flip;
        arrowClass = "kb-arrow kb-arrow-bottom"; arrowPos = { side: "bottom" };
      } else if (zone === "bottom-center") {
        // Center-Spalte nie zentriert: seitlich versetzt, Korridor bleibt frei
        left = sideLeft;
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
        left = currentMouseX - cardWidth - flipDiag;
        top = currentMouseY - cardHeight - flipDiag;
        arrowClass = "kb-arrow kb-arrow-bottom-right"; arrowPos = { side: "custom", style: { right: "16px", bottom: "-6px", top: "auto", left: "auto", transform: "rotate(135deg)" } };
      } else if (zone === "top-right") {
        left = currentMouseX + flipDiag;
        top = currentMouseY - cardHeight - flipDiag;
        arrowClass = "kb-arrow kb-arrow-bottom-left"; arrowPos = { side: "custom", style: { left: "16px", bottom: "-6px", top: "auto", right: "auto", transform: "rotate(225deg)" } };
      } else if (zone === "bottom-left") {
        left = currentMouseX - cardWidth - flipDiag;
        top = currentMouseY + flipDiag;
        arrowClass = "kb-arrow kb-arrow-top-right"; arrowPos = { side: "custom", style: { right: "16px", top: "-6px", bottom: "auto", left: "auto", transform: "rotate(45deg)" } };
      } else if (zone === "bottom-right") {
        left = currentMouseX + flipDiag;
        top = currentMouseY + flipDiag;
        arrowClass = "kb-arrow kb-arrow-top-left"; arrowPos = { side: "custom", style: { left: "16px", top: "-6px", bottom: "auto", right: "auto", transform: "rotate(-45deg)" } };
      } else {
        left = r.right + flip;
        top = r.top + (r.height - cardHeight) / 2;
        arrowClass = "kb-arrow kb-arrow-left"; arrowPos = { side: "left" };
      }

      // Flip mit Lookahead: zuerst die Gegenseite (lässt den Mausweg frei),
      // nur wenn weder oben noch unten passt, seitlich ausweichen.
      if (top < padding || top + cardHeight > viewportHeight - padding) {
        const above = currentMouseY - cardHeight - flip;
        const below = currentMouseY + flip;
        const fitsAbove = above >= padding;
        const fitsBelow = below + cardHeight <= viewportHeight - padding;
        // Notfall-Seite: nur vertikal zentrieren, waagrechte Wahl der Zone
        // (Ecken, Engstellen, Center-Spalte) bleibt bestehen, Kante regelt Clamp
        const flipSide = () => {
          top = currentMouseY - cardHeight / 2;
        };
        if (top < padding && fitsBelow) top = below;
        else if (top + cardHeight > viewportHeight - padding && fitsAbove) top = above;
        else if (fitsAbove) top = above;
        else if (fitsBelow) top = below;
        else { flipSide(); trackLog(`SEITENWECHSEL weder oben noch unten passt Zone=${zone}`, `sidenone|${zone}`); }
      }
      if (left < padding || left + cardWidth > viewportWidth - padding) {
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
      left = Math.max(padding, Math.min(left, viewportWidth - cardWidth - padding));
      top = Math.max(padding, Math.min(top, viewportHeight - cardHeight - padding));
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
      // Lage der Karte zum Mauszeiger und Verankerung an der Viewport-Kante
      const lage = cardBottom <= currentMouseY ? "oberhalb" : (top >= currentMouseY ? "unterhalb" : "seitlich");
      const anschlag = top <= padding + 0.5 ? "oben" : (top >= viewportHeight - cardHeight - padding - 0.5 ? "unten" : "keiner");
      // Korridor-Metrik: wie viel Pixel der Karte das Vertikalband (+-20 um die Maus) oben/unten verdecken
      const korridorLinks = currentMouseX - 20;
      const korridorRechts = currentMouseX + 20;
      const waagrechteUeberlappung = Math.max(0, Math.min(left + cardWidth, korridorRechts) - Math.max(left, korridorLinks));
      const korridorOben = waagrechteUeberlappung > 0 ? Math.round(Math.max(0, Math.min(cardBottom, currentMouseY) - Math.max(top, 0))) : 0;
      const korridorUnten = waagrechteUeberlappung > 0 ? Math.round(Math.max(0, Math.min(cardBottom, viewportHeight) - Math.max(top, currentMouseY))) : 0;
      const richtung = trackDir > 0 ? "runter" : (trackDir < 0 ? "hoch" : "steht");
      trackLog(`Zone=${zone} Maus=(${Math.round(currentMouseX)},${Math.round(currentMouseY)}) Karte=(links ${Math.round(left)} oben ${Math.round(top)} breite ${Math.round(cardWidth)} hoehe ${Math.round(cardHeight)}) Spitze=(${tipX},${tipY}) Luecke=${Math.round(currentMouseY - cardBottom)} Richtung=${richtung} Tempo=${trackSpd.toFixed(2)} Lage=${lage} Anschlag=${anschlag} KorridorOben=${korridorOben} KorridorUnten=${korridorUnten} Treffer=(oben ${itemKey} hoehe ${Math.round(r.height)}) Festgehalten=${stuckAbove ? "an" : "aus"} InKarte=${mouseInCard ? "ja" : "nein"}`, `pos|${zone}`);
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
    if (arrow) {
      // Seite aus echter Geometrie nach Clamp bestimmen, nicht aus Entry-Zone:
      // Spitze zeigt stets auf den Mauszeiger.
      // Raute 12px: Mitte exakt auf Cursorlinie (-6), Ecken diagonal gedreht.
      const mx = currentMouseX, my = currentMouseY;
      const cardH = previewCard.offsetHeight || cardHeight;
      const R = left + cardWidth, B = top + cardH;
      const leftOf = mx < left, rightOf = mx > R;
      const above = my < top, below = my > B;
      let s = null;
      if (leftOf && !above && !below) {
        s = { cls: "kb-arrow kb-arrow-left", top: `${Math.round(Math.max(16, Math.min(my - top - 6, cardH - 16)))}px` };
      } else if (rightOf && !above && !below) {
        s = { cls: "kb-arrow kb-arrow-right", top: `${Math.round(Math.max(16, Math.min(my - top - 6, cardH - 16)))}px` };
      } else if (above && !leftOf && !rightOf) {
        s = { cls: "kb-arrow kb-arrow-top", left: `${Math.round(Math.max(16, Math.min(mx - left - 6, cardWidth - 16)))}px` };
      } else if (below && !leftOf && !rightOf) {
        s = { cls: "kb-arrow kb-arrow-bottom", left: `${Math.round(Math.max(16, Math.min(mx - left - 6, cardWidth - 16)))}px` };
      } else if (leftOf && above) {
        s = { cls: "kb-arrow", style: { left: `${Math.round(Math.max(16, Math.min(mx - left - 6, cardWidth - 16)))}px`, top: "-6px", bottom: "auto", right: "auto", transform: "rotate(0deg)" } };
      } else if (rightOf && above) {
        s = { cls: "kb-arrow", style: { left: `${Math.round(Math.max(16, Math.min(mx - left - 6, cardWidth - 16)))}px`, top: "-6px", bottom: "auto", right: "auto", transform: "rotate(90deg)" } };
      } else if (leftOf && below) {
        s = { cls: "kb-arrow", style: { left: `${Math.round(Math.max(16, Math.min(mx - left - 6, cardWidth - 16)))}px`, bottom: "-6px", top: "auto", right: "auto", transform: "rotate(-90deg)" } };
      } else if (rightOf && below) {
        s = { cls: "kb-arrow", style: { left: `${Math.round(Math.max(16, Math.min(mx - left - 6, cardWidth - 16)))}px`, bottom: "-6px", top: "auto", right: "auto", transform: "rotate(180deg)" } };
      } else {
        // Maus überlappt Card (nach Clamp): nächste Kante nehmen
        const dL = Math.abs(mx - left), dR = Math.abs(mx - R);
        const dT = Math.abs(my - top), dB = Math.abs(my - B);
        const m = Math.min(dL, dR, dT, dB);
        if (m === dL) s = { cls: "kb-arrow kb-arrow-left", top: `${Math.round(Math.max(16, Math.min(my - top - 6, cardH - 16)))}px` };
        else if (m === dR) s = { cls: "kb-arrow kb-arrow-right", top: `${Math.round(Math.max(16, Math.min(my - top - 6, cardH - 16)))}px` };
        else if (m === dT) s = { cls: "kb-arrow kb-arrow-top", left: `${Math.round(Math.max(16, Math.min(mx - left - 6, cardWidth - 16)))}px` };
        else s = { cls: "kb-arrow kb-arrow-bottom", left: `${Math.round(Math.max(16, Math.min(mx - left - 6, cardWidth - 16)))}px` };
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
        lastCol = -1;
        lastRow = -1;

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
        lastCol = -1;
        lastRow = -1;
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
