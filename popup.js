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
          const schluessel = s.dataset.kbKey;
          const wert = e.target.checked;
          // Erst schreiben, dann lesen: sonst liefert Lesen den alten Stand
          chrome.storage.local.set({ [schluessel]: wert }, () => {
            if (schluessel.indexOf("kbMod") === 0) updateModSubs();
            if (schluessel === "kbPopupX") syncPopupX();
          });
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
      // Tether Einstellungen klappen ein bei Tether aus oder Positioning aus
      const tetherAn = an(r.kbModTether) && staende.kbModPositioning;
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

  // Apple Vorlage: Ausgabe Format laden und bei Eingabe speichern
  const appleTemplate = document.getElementById("appleTemplate");
  if (appleTemplate) {
    chrome.storage.local.get(["kbAppleTemplate"], (r) => {
      if (r.kbAppleTemplate) appleTemplate.value = r.kbAppleTemplate;
    });
    appleTemplate.addEventListener("change", (e) => {
      chrome.storage.local.set({ kbAppleTemplate: e.target.value });
    });
  }

  // Filter CRUD: Stoppwörter + eigene Aliase verwalten
  const FILTER_STD = ["tasche", "hülle", "huelle", "case", "cover", "ladekabel", "netzteil", "ladegerät", "ladegeraet", "adapter", "folie", "ständer", "staender", "halterung", "dock"];
  const blockListe = document.getElementById("filterBlockListe");
  const blockNeu = document.getElementById("filterBlockNeu");
  const blockAdd = document.getElementById("filterBlockAdd");
  const aliasListe = document.getElementById("filterAliasListe");
  const aliasNeu = document.getElementById("filterAliasNeu");
  const aliasModell = document.getElementById("filterAliasModell");
  const aliasAdd = document.getElementById("filterAliasAdd");
  const leseBlock = (cb) => {
    chrome.storage.local.get(["kbFilterBlock"], (r) => {
      cb(Array.isArray(r.kbFilterBlock) ? r.kbFilterBlock : FILTER_STD.slice());
    });
  };
  const leseAlias = (cb) => {
    chrome.storage.local.get(["kbFilterAlias"], (r) => {
      cb(Array.isArray(r.kbFilterAlias) ? r.kbFilterAlias : []);
    });
  };
  // Klick auf Text -> Eingabefeld zum Bearbeiten
  const bearbeitbar = (span, wert, speichern) => {
    span.addEventListener("click", () => {
      const feld = document.createElement("input");
      feld.value = wert;
      span.replaceWith(feld);
      feld.focus();
      feld.select();
      const fertig = (uebernehmen) => {
        if (uebernehmen && feld.value.trim()) speichern(feld.value.trim());
        else maleFilter();
      };
      feld.addEventListener("keydown", (e) => {
        if (e.key === "Enter") fertig(true);
        else if (e.key === "Escape") fertig(false);
      });
      feld.addEventListener("blur", () => fertig(true));
    });
  };
  const maleFilter = () => {
    if (!blockListe || !aliasListe) return;
    blockListe.innerHTML = "";
    aliasListe.innerHTML = "";
    leseBlock((worte) => {
      worte.forEach((wort, i) => {
        const zeile = document.createElement("div");
        zeile.className = "kb-filter-zeile";
        const text = document.createElement("span");
        text.textContent = wort;
        bearbeitbar(text, wort, (neu) => {
          leseBlock((w) => { w[i] = neu; chrome.storage.local.set({ kbFilterBlock: w }, maleFilter); });
        });
        const del = document.createElement("button");
        del.className = "kb-filter-del";
        del.textContent = "×";
        del.setAttribute("aria-label", "Stoppwort löschen");
        del.addEventListener("click", () => {
          leseBlock((w) => { w.splice(i, 1); chrome.storage.local.set({ kbFilterBlock: w }, maleFilter); });
        });
        zeile.appendChild(text);
        zeile.appendChild(del);
        blockListe.appendChild(zeile);
      });
    });
    leseAlias((eintraege) => {
      eintraege.forEach((eintrag, i) => {
        const zeile = document.createElement("div");
        zeile.className = "kb-filter-zeile";
        const text = document.createElement("span");
        text.textContent = `${eintrag.phrase} → ${eintrag.id}`;
        bearbeitbar(text, eintrag.phrase, (neu) => {
          leseAlias((e) => { e[i] = { phrase: neu, id: eintrag.id }; chrome.storage.local.set({ kbFilterAlias: e }, maleFilter); });
        });
        const del = document.createElement("button");
        del.className = "kb-filter-del";
        del.textContent = "×";
        del.setAttribute("aria-label", "Alias löschen");
        del.addEventListener("click", () => {
          leseAlias((e) => { e.splice(i, 1); chrome.storage.local.set({ kbFilterAlias: e }, maleFilter); });
        });
        zeile.appendChild(text);
        zeile.appendChild(del);
        aliasListe.appendChild(zeile);
      });
    });
  };
  if (blockAdd && blockNeu) {
    const blockHinzu = () => {
      const wort = blockNeu.value.trim().toLowerCase();
      if (!wort) return;
      leseBlock((w) => {
        if (w.indexOf(wort) === -1) w.push(wort);
        chrome.storage.local.set({ kbFilterBlock: w }, () => { blockNeu.value = ""; maleFilter(); });
      });
    };
    blockAdd.addEventListener("click", blockHinzu);
    blockNeu.addEventListener("keydown", (e) => { if (e.key === "Enter") blockHinzu(); });
  }
  // Modell Dropdown aus apple-models.json füllen
  if (aliasModell) {
    fetch(chrome.runtime.getURL("apple-models.json")).then((a) => a.json()).then((d) => {
      (d.modelle || []).forEach((m) => {
        const opt = document.createElement("option");
        opt.value = m.id;
        opt.textContent = m.id;
        aliasModell.appendChild(opt);
      });
    }).catch(() => {});
  }
  if (aliasAdd && aliasNeu && aliasModell) {
    const aliasHinzu = () => {
      const phrase = aliasNeu.value.trim().toLowerCase();
      const id = aliasModell.value;
      if (!phrase || !id) return;
      leseAlias((e) => {
        e.push({ phrase, id });
        chrome.storage.local.set({ kbFilterAlias: e }, () => { aliasNeu.value = ""; maleFilter(); });
      });
    };
    aliasAdd.addEventListener("click", aliasHinzu);
    aliasNeu.addEventListener("keydown", (e) => { if (e.key === "Enter") aliasHinzu(); });
  }
  maleFilter();

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
