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

  homeInput.addEventListener("change", (e) => {
    const val = e.target.value.trim();
    chrome.storage.local.set({ kbHomeLocation: val });
  });
  homeInput.addEventListener("blur", (e) => {
    const val = e.target.value.trim();
    chrome.storage.local.set({ kbHomeLocation: val });
  });
});
