document.addEventListener("DOMContentLoaded", () => {
  const select = document.getElementById("theme");
  const homeInput = document.getElementById("home");

  chrome.storage.local.get(["kbTheme", "kbHomeLocation"], (result) => {
    if (result.kbTheme) {
      select.value = result.kbTheme;
    }
    if (result.kbHomeLocation) {
      homeInput.value = result.kbHomeLocation;
    }
  });

  select.addEventListener("change", (e) => {
    const theme = e.target.value;
    chrome.storage.local.set({ kbTheme: theme });
  });

  const saveBtn = document.getElementById("saveHome");
  const save = () => {
    const val = homeInput.value.trim();
    chrome.storage.local.set({ kbHomeLocation: val }, () => {
      // Verifikation: direkt wieder auslesen
      chrome.storage.local.get(["kbHomeLocation"], (r) => {
        console.log("kbHomeLocation gespeichert:", r.kbHomeLocation);
      });
      const orig = saveBtn.textContent;
      saveBtn.textContent = "✓ Gespeichert";
      saveBtn.style.background = "#22c55e";
      saveBtn.style.color = "#ffffff";
      setTimeout(() => {
        saveBtn.textContent = orig;
        saveBtn.style.background = "#38bdf8";
        saveBtn.style.color = "#0f172a";
      }, 1200);
    });
  };
  saveBtn.addEventListener("click", save);
  homeInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      save();
    }
  });
});
