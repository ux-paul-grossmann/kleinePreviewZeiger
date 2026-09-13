// Popup-Start: gespeicherte Einstellungen laden und Oberfläche verdrahten
document.addEventListener("DOMContentLoaded", () => {
  // Dreistufen-Thema: Sonne, System, Mond (System ist Standard)
  const homeInput = document.getElementById("home");
  const themeSegBtns = [...document.querySelectorAll(".theme-seg-btn")];
  const syncThemeSeg = (wert) => {
    themeSegBtns.forEach((b) => {
      const an = b.dataset.theme === wert;
      b.classList.toggle("active", an);
      b.setAttribute("aria-checked", an ? "true" : "false");
    });
  };
  // Popup-Eigenlook: Schalterwert aufs Popup anwenden (System = Attribut weg)
  const applyPopupTheme = (wert) => {
    if (wert === "light" || wert === "dark") {
      document.documentElement.setAttribute("data-kb-theme", wert);
    } else {
      document.documentElement.removeAttribute("data-kb-theme");
    }
  };
  const saveBtn = document.getElementById("saveHome");
  const debugToggle = document.getElementById("debugToggle");
  const debugToolsList = document.getElementById("debugToolsList");
  const advToggle = document.getElementById("advToggle");
  const cogIcon = document.getElementById("cogIcon");
  const backIcon = document.getElementById("backIcon");

  // Erweiterte Ansicht öffnen und schließen
  if (advToggle) {
    advToggle.addEventListener("click", () => {
      const an = document.body.classList.toggle("kb-advanced");
      if (cogIcon) cogIcon.style.display = an ? "none" : "";
      if (backIcon) backIcon.style.display = an ? "" : "none";
      advToggle.setAttribute("aria-label", an ? "Zurück zur Hauptansicht" : "Erweiterte Einstellungen öffnen");
    });
  }

  // Gespeicherte Werte aus dem lokalen Speicher lesen und anzeigen
  chrome.storage.local.get(["kbTheme", "kbHomeLocation", "kbDebugUiEnabled", "kbAccent"], (result) => {
    const thema = result.kbTheme || "system";
    syncThemeSeg(thema);
    applyPopupTheme(thema);
    if (result.kbHomeLocation) homeInput.value = result.kbHomeLocation;
    if (debugToggle) debugToggle.checked = result.kbDebugUiEnabled !== false; // default true
    syncAccentDots(result.kbAccent || "multicolor");
    mirrorLesen();
    updateDebugToolsList();
    updateModSubs();
  });

  // Mirror-Schalter generisch über das ganze Popup: data-kb-key ist der Speicherschlüssel
  // data-kb-default false bedeutet Standard aus (sonst Standard an)
  const mirrorLesen = () => {
    const schalter = [...document.querySelectorAll("input[data-kb-key]")];
    const schluessel = schalter.map((s) => s.dataset.kbKey);
    chrome.storage.local.get(schluessel, (result) => {
      schalter.forEach((s) => {
        const wert = result[s.dataset.kbKey];
        const standard = s.dataset.kbDefault !== "false";
        s.checked = typeof wert === "boolean" ? wert : standard;
      });
    });
    schalter.forEach((s) => {
      if (!s.dataset.kbVerbunden) {
        s.dataset.kbVerbunden = "ja";
        s.addEventListener("change", (e) => {
          chrome.storage.local.set({ [s.dataset.kbKey]: e.target.checked });
          if (s.dataset.kbKey.indexOf("kbMod") === 0) updateModSubs();
        });
      }
    });
  };

  // Sub Module folgen ihrem Main Module: Zeile eingeklappt bei Main aus
  // Preview-Card Zeilen tragen data-kb-sub mit dem Schlüssel des Main Modules
  // Tether Einstellungen tragen data-kb-sub2 mit dem Tether Schlüssel
  const updateModSubs = () => {
    chrome.storage.local.get(["kbModPositioning", "kbModArrow", "kbModTether"], (r) => {
      const an = (wert) => wert !== false; // Standard an
      const staende = {
        kbModPositioning: an(r.kbModPositioning),
        kbModArrow: an(r.kbModArrow),
      };
      document.querySelectorAll("[data-kb-sub]").forEach((zeile) => {
        const haupt = staende[zeile.dataset.kbSub];
        const aktiv = haupt !== false;
        zeile.style.display = aktiv ? "" : "none";
        const eingabe = zeile.querySelector("input");
        if (eingabe) eingabe.disabled = !aktiv;
      });
      const tetherAn = an(r.kbModTether);
      document.querySelectorAll('[data-kb-sub2="kbModTether"]').forEach((zeile) => {
        zeile.style.display = tetherAn ? "" : "none";
      });
    });
  };

  // Tether Anker: 3x3 Grid als Radio Gruppe, Richtung speichern
  const anchorBtns = [...document.querySelectorAll(".kb-anchor-btn")];
  const syncTetherAnker = (wert) => {
    anchorBtns.forEach((b) => {
      const an = b.dataset.dir === wert;
      b.classList.toggle("active", an);
      b.setAttribute("aria-checked", an ? "true" : "false");
    });
  };
  anchorBtns.forEach((b) => {
    b.addEventListener("click", () => {
      chrome.storage.local.set({ kbTetherRichtung: b.dataset.dir });
      syncTetherAnker(b.dataset.dir);
    });
  });

  // Tether Distanz: Slider mit Wert daneben, live speichern
  const distanzRegler = document.getElementById("tetherDistanz");
  const distanzWert = document.getElementById("tetherDistanzWert");
  if (distanzRegler) {
    distanzRegler.addEventListener("input", (e) => {
      const wert = Number(e.target.value);
      if (distanzWert) distanzWert.textContent = String(wert);
      chrome.storage.local.set({ kbTetherDistanz: wert });
    });
  }
  // Tether Stände einmalig laden: Anker, Distanz, Untereinstellungen
  chrome.storage.local.get(["kbTetherRichtung", "kbTetherDistanz"], (r) => {
    syncTetherAnker(r.kbTetherRichtung || "auto");
    if (distanzRegler) distanzRegler.value = r.kbTetherDistanz === undefined ? 32 : r.kbTetherDistanz;
    if (distanzWert) distanzWert.textContent = String(r.kbTetherDistanz === undefined ? 32 : r.kbTetherDistanz);
    updateModSubs();
  });

  // Werkzeugliste nur zeigen solange der Hauptschalter an ist
  const updateDebugToolsList = () => {
    if (debugToolsList) debugToolsList.style.display = debugToggle && debugToggle.checked ? "" : "none";
  };

  // Dreistufen-Thema wählen und speichern (explizite Werte wie bisher)
  themeSegBtns.forEach((b) => {
    b.addEventListener("click", () => {
      chrome.storage.local.set({ kbTheme: b.dataset.theme });
      syncThemeSeg(b.dataset.theme);
      applyPopupTheme(b.dataset.theme);
    });
  });

  // Wohnort speichern mit kurzer Bestätigung auf dem Knopf
  const save = () => {
    const val = homeInput.value.trim();
    chrome.storage.local.set({ kbHomeLocation: val }, () => {
      const orig = saveBtn.textContent;
      saveBtn.textContent = "✓ Gespeichert";
      saveBtn.style.background = "#22c55e";
      setTimeout(() => {
        saveBtn.textContent = orig;
        saveBtn.style.background = "";
      }, 1200);
    });
  };
  saveBtn.addEventListener("click", save);
  homeInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); save(); } });

  // Akzentfarbe: Punkte synchronisieren, Auswahl speichern (Standard mehrfarbig)
  const accentDots = [...document.querySelectorAll(".accent-dot")];
  const syncAccentDots = (wert) => {
    accentDots.forEach((d) => {
      const an = d.dataset.accent === wert;
      d.classList.toggle("active", an);
      d.setAttribute("aria-checked", an ? "true" : "false");
    });
  };
  accentDots.forEach((d) => {
    d.addEventListener("click", () => {
      chrome.storage.local.set({ kbAccent: d.dataset.accent });
      syncAccentDots(d.dataset.accent);
    });
  });

  // Debug-Oberfläche in der Vorschau an- und abschalten
  // Werkzeugliste nur zeigen solange der Hauptschalter an ist
  if (debugToggle) {
    debugToggle.addEventListener("change", (e) => {
      chrome.storage.local.set({ kbDebugUiEnabled: e.target.checked });
      updateDebugToolsList();
    });
  }
});
