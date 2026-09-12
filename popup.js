document.addEventListener("DOMContentLoaded", () => {
  const select = document.getElementById("theme");
  const homeInput = document.getElementById("home");
  const saveBtn = document.getElementById("saveHome");
  const themeToggle = document.getElementById("themeToggle");

  chrome.storage.local.get(["kbTheme", "kbHomeLocation", "kbThemeModuleEnabled"], (result) => {
    if (result.kbTheme) select.value = result.kbTheme;
    if (result.kbHomeLocation) homeInput.value = result.kbHomeLocation;
    if (themeToggle) themeToggle.checked = result.kbThemeModuleEnabled !== false; // default true
  });

  select.addEventListener("change", (e) => {
    chrome.storage.local.set({ kbTheme: e.target.value });
  });

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

  if (themeToggle) {
    themeToggle.addEventListener("change", (e) => {
      chrome.storage.local.set({ kbThemeModuleEnabled: e.target.checked });
    });
  }
});
