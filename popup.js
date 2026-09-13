// Popup-Start: gespeicherte Einstellungen laden und Oberfläche verdrahten
document.addEventListener("DOMContentLoaded", () => {
  const select = document.getElementById("theme");
  const homeInput = document.getElementById("home");
  const saveBtn = document.getElementById("saveHome");
  const debugToggle = document.getElementById("debugToggle");
  const debugToolsList = document.getElementById("debugToolsList");

  // Gespeicherte Werte aus dem lokalen Speicher lesen und anzeigen
  chrome.storage.local.get(["kbTheme", "kbHomeLocation", "kbDebugUiEnabled", "kbAccent"], (result) => {
    if (result.kbHomeLocation) homeInput.value = result.kbHomeLocation;
    if (debugToggle) debugToggle.checked = result.kbDebugUiEnabled !== false; // default true
    spiegelLesen();
    updateDebugToolsList();
  });

  // Erscheinungsbild wechseln und speichern
  select.addEventListener("change", (e) => {
    chrome.storage.local.set({ kbTheme: e.target.value });
  });
  // Spiegel-Schalter generisch: data-kb-key ist der Speicherschlüssel
  // data-kb-default false bedeutet Standard aus (sonst Standard an)
  const spiegelLesen = () => {
    if (!debugToolsList) return;
    const schalter = [...debugToolsList.querySelectorAll("input[data-kb-key]")];
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
        });
      }
    });
  };

  // Werkzeugliste nur zeigen solange der Hauptschalter an ist
  const updateDebugToolsList = () => {
    if (debugToolsList) debugToolsList.style.display = debugToggle && debugToggle.checked ? "" : "none";
  };


  // Wohnort speichern mit kurzer Bestätigung auf dem Knopf
  const save = () => {
    const val = homeInput.value.trim();
    chrome.storage.local.set({ kbHomeLocation: val }, () => {
      const orig = saveBtn.textContent;
      saveBtn.textContent = "✓ Gespeichert";
      saveBtn.style.background = "#22c55e";
      setTimeout(() => {
        saveBtn.textContent = orig;
        saveBtn.style.background = "#38bdf8";
      }, 1200);
    });
  };
  saveBtn.addEventListener("click", save);
  homeInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); save(); } });

  // Debug-Oberfläche in der Vorschau an- und abschalten
  // Werkzeugliste nur zeigen solange der Hauptschalter an ist
  if (debugToggle) {
    debugToggle.addEventListener("change", (e) => {
      chrome.storage.local.set({ kbDebugUiEnabled: e.target.checked });
      updateDebugToolsList();
    });
  }
});
