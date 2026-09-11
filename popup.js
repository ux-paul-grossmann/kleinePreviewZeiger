document.addEventListener("DOMContentLoaded", () => {
  const select = document.getElementById("theme");

  chrome.storage.local.get(["kbTheme"], (result) => {
    if (result.kbTheme) {
      select.value = result.kbTheme;
    }
  });

  select.addEventListener("change", (e) => {
    const theme = e.target.value;
    chrome.storage.local.set({ kbTheme: theme });
  });
});
