(() => {
  const cache = new Map();

  let hoverTimeout = null;
  let currentMouseX = 0;
  let currentMouseY = 0;
  let currentItemRect = null;
  let currentZoomFactor = "2.5x";

  function applyTheme(theme) {
    if (theme === "light" || theme === "dark") {
      document.documentElement.setAttribute("data-kb-theme", theme);
    } else {
      document.documentElement.removeAttribute("data-kb-theme");
    }
  }

  if (typeof chrome !== "undefined" && chrome.storage) {
    chrome.storage.local.get(["kbTheme", "kbZoomFactor"], (result) => {
      applyTheme(result.kbTheme || "system");
      if (result.kbZoomFactor) {
        currentZoomFactor = result.kbZoomFactor;
      }
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes.kbTheme) {
        applyTheme(changes.kbTheme.newValue);
      }
    });
  }

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

  document.addEventListener("mousemove", (e) => {
    currentMouseX = e.clientX;
    currentMouseY = e.clientY;
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
        e.target.closest(".kb-copy-btn")
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
      const copyBtn = imgContainer.querySelector(".kb-copy-btn");
      if (copyBtn) copyBtn.classList.remove("kb-copy-hidden");
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
    if (copyBtn) {
      copyBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!isPanningLocked) return;
        try {
          await copyVisibleCropToClipboard();
          copyBtn.classList.add("kb-copy-success");
          copyBtn.textContent = "✓ Kopieren erfolgreich";
          setTimeout(() => {
            isPanningLocked = false;
            imgContainer.classList.remove("kb-panning-locked");
            copyBtn.classList.add("kb-copy-hidden");
            copyBtn.classList.remove("kb-copy-success");
            copyBtn.textContent = "Bildausschnitt in Zwischenablage kopieren";
          }, 1000);
        } catch (err) {
          console.error("Copy failed:", err);
          copyBtn.textContent = "Fehler beim Kopieren";
          setTimeout(() => {
            isPanningLocked = false;
            imgContainer.classList.remove("kb-panning-locked");
            copyBtn.classList.add("kb-copy-hidden");
            copyBtn.textContent = "Bildausschnitt in Zwischenablage kopieren";
          }, 1000);
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
        const b = imgContainer.querySelector(".kb-copy-btn");
        if (b) {
          b.classList.add("kb-copy-hidden");
          b.classList.remove("kb-copy-success");
          b.textContent = "Bildausschnitt in Zwischenablage kopieren";
        }
      }
    };
  }

  function renderCardContent(data, title, price, url) {
    let currentImgIdx = 0;
    const hasImages = data.images && data.images.length > 0;
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.location)}`;

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
        ${hasImages ? `<button class="kb-copy-btn kb-copy-hidden" aria-label="Bildausschnitt kopieren">Bildausschnitt in Zwischenablage kopieren</button>` : ""}
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
        <a href="${url}" class="kb-btn kb-btn-primary">Anzeige ansehen</a>
        <a href="${mapsUrl}" target="_blank" rel="noopener noreferrer" class="kb-btn kb-btn-secondary">🗺️ Route planen</a>
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
  }

  function positionCardAtCursor() {
    const cardWidth = 360;
    const cardHeight = previewCard.offsetHeight || 450;
    const padding = 15;
    const gap = 12;
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
      const col = relX < 0.33 ? 0 : relX < 0.66 ? 1 : 2;
      const row = relY < 0.33 ? 0 : relY < 0.66 ? 1 : 2;
      const zoneMap = [
        ["top-left", "top-center", "top-right"],
        ["center-left", "center-center", "center-right"],
        ["bottom-left", "bottom-center", "bottom-right"],
      ];
      const zone = zoneMap[row][col];
      // Dreieck bleibt an Card (child), Card folgt Maus kontinuierlich
      if (zone === "center-center") {
        left = currentMouseX + gap;
        top = currentMouseY - cardHeight / 2;
        arrowClass = "kb-arrow kb-arrow-left"; arrowPos = { side: "left" };
      } else if (zone === "center-left") {
        left = currentMouseX - cardWidth - gap;
        top = currentMouseY - cardHeight / 2;
        arrowClass = "kb-arrow kb-arrow-right"; arrowPos = { side: "right" };
      } else if (zone === "center-right") {
        left = currentMouseX + gap;
        top = currentMouseY - cardHeight / 2;
        arrowClass = "kb-arrow kb-arrow-left"; arrowPos = { side: "left" };
      } else if (zone === "top-center") {
        left = currentMouseX - cardWidth / 2;
        top = currentMouseY - cardHeight - gap;
        arrowClass = "kb-arrow kb-arrow-bottom"; arrowPos = { side: "bottom" };
      } else if (zone === "bottom-center") {
        left = currentMouseX - cardWidth / 2;
        top = currentMouseY + gap;
        arrowClass = "kb-arrow kb-arrow-top"; arrowPos = { side: "top" };
      } else if (zone === "top-left") {
        left = currentMouseX - cardWidth - gap;
        top = currentMouseY - cardHeight - gap;
        arrowClass = "kb-arrow kb-arrow-bottom-right"; arrowPos = { side: "custom", style: { right: "16px", bottom: "-6px", top: "auto", left: "auto", transform: "rotate(135deg)" } };
      } else if (zone === "top-right") {
        left = currentMouseX + gap;
        top = currentMouseY - cardHeight - gap;
        arrowClass = "kb-arrow kb-arrow-bottom-left"; arrowPos = { side: "custom", style: { left: "16px", bottom: "-6px", top: "auto", right: "auto", transform: "rotate(135deg)" } };
      } else if (zone === "bottom-left") {
        left = currentMouseX - cardWidth - gap;
        top = currentMouseY + gap;
        arrowClass = "kb-arrow kb-arrow-top-right"; arrowPos = { side: "custom", style: { right: "16px", top: "-6px", bottom: "auto", left: "auto", transform: "rotate(45deg)" } };
      } else if (zone === "bottom-right") {
        left = currentMouseX + gap;
        top = currentMouseY + gap;
        arrowClass = "kb-arrow kb-arrow-top-left"; arrowPos = { side: "custom", style: { left: "16px", top: "-6px", bottom: "auto", right: "auto", transform: "rotate(45deg)" } };
      } else {
        left = r.right + gap;
        top = r.top + (r.height - cardHeight) / 2;
        arrowClass = "kb-arrow kb-arrow-left"; arrowPos = { side: "left" };
      }

      // clamp to viewport, Dreieck bleibt an Card
      left = Math.max(padding, Math.min(left, viewportWidth - cardWidth - padding));
      top = Math.max(padding, Math.min(top, viewportHeight - cardHeight - padding));
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
      arrow.className = arrowClass;
      arrow.style.top = "";
      arrow.style.bottom = "";
      arrow.style.left = "";
      arrow.style.right = "";
      arrow.style.transform = "";
      if (arrowPos.side === "left" || arrowPos.side === "right") {
        let arrowTop = currentMouseY - top;
        arrowTop = Math.max(16, Math.min(arrowTop, previewCard.offsetHeight - 16));
        arrow.style.top = `${Math.round(arrowTop)}px`;
      } else if (arrowPos.side === "top" || arrowPos.side === "bottom") {
        let arrowLeft = currentMouseX - left;
        arrowLeft = Math.max(16, Math.min(arrowLeft, cardWidth - 16));
        arrow.style.left = `${Math.round(arrowLeft)}px`;
      } else if (arrowPos.side === "custom" && arrowPos.style) {
        Object.assign(arrow.style, arrowPos.style);
      }
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

        const url = linkEl.href;

        const titleEl = item.querySelector("h3 a[href*='/s-anzeige/']");
        const title = titleEl ? titleEl.textContent.trim() : linkEl.textContent.trim();

        const priceEl = item.querySelector("p[class*='text-title'], [class*='font-bold'], [class*='price']");
        const price = priceEl ? priceEl.textContent.trim() : "";
        currentItemRect = item.getBoundingClientRect();
        currentMouseX = e.clientX;
        currentMouseY = e.clientY;

        hoverTimeout = setTimeout(async () => {
          previewCard.innerHTML = `<div class="kb-loading">Lade Vorschau...</div>`;
          previewCard.classList.remove("kb-card-hidden");
          positionCardAtCursor();

          const data = await fetchAdDetails(url);
          if (data) {
            renderCardContent(data, title, price, url);
            positionCardAtCursor();
          }
        }, 300);
      });

      item.addEventListener("mousemove", (e) => {
        if (!previewCard.classList.contains("kb-card-hidden")) {
          currentMouseX = e.clientX;
          currentMouseY = e.clientY;
          // update zone continuously
          if (currentItemRect) {
            const relX = (currentMouseX - currentItemRect.left) / currentItemRect.width;
            const relY = (currentMouseY - currentItemRect.top) / currentItemRect.height;
            // stay within item bounds for zone calc, but still update position
          }
          positionCardAtCursor();
        }
      });

      item.addEventListener("mouseleave", () => {
        clearTimeout(hoverTimeout);
      });
    });
  }

  document.addEventListener("click", (e) => {
    if (!previewCard.contains(e.target) && !e.target.closest("li.relative.mb-xsmall")) {
      previewCard.classList.add("kb-card-hidden");
    }
  });

  attachHoverListeners();

  const observer = new MutationObserver(() => {
    attachHoverListeners();
  });

  observer.observe(document.body, { childList: true, subtree: true });
})();
