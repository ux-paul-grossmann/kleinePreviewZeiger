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
      const orig = saveBtn.textContent;
      saveBtn.textContent = "✓";
      setTimeout(() => saveBtn.textContent = orig, 1000);
    });
  };
  saveBtn.addEventListener("click", save);
  homeInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") save();
  });
  homeInput.addEventListener("change", (e) => {
    const val = e.target.value.trim();
    chrome.storage.local.set({ kbHomeLocation: val });
  });
  homeInput.addEventListener("blur", (e) => {
    const val = e.target.value.trim();
    chrome.storage.local.set({ kbHomeLocation: val });
  });
});
