// app.js — Presentation runner (hardened)
(async function () {
  // Helpers
  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from((root || document).querySelectorAll(sel));

  function showFatal(message, detail) {
    console.error(message, detail || "");
    const existing = qs("#fatalError");
    if (existing) existing.remove();

    const box = document.createElement("div");
    box.id = "fatalError";
    box.style.position = "fixed";
    box.style.left = "16px";
    box.style.right = "16px";
    box.style.bottom = "16px";
    box.style.zIndex = "999999";
    box.style.padding = "14px 16px";
    box.style.borderRadius = "14px";
    box.style.background = "rgba(20,20,22,0.92)";
    box.style.color = "white";
    box.style.fontFamily = "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial";
    box.style.boxShadow = "0 18px 55px rgba(0,0,0,0.35)";
    box.innerHTML = `
      <div style="font-weight:700;margin-bottom:6px;">Deck failed to load</div>
      <div style="opacity:0.9;line-height:1.35;margin-bottom:10px;">${escapeHtml(message)}</div>
      <pre style="white-space:pre-wrap;word-break:break-word;opacity:0.9;margin:0;padding:10px;border-radius:12px;background:rgba(255,255,255,0.06);max-height:200px;overflow:auto;">${escapeHtml(
        detail ? String(detail) : ""
      )}</pre>
    `;
    document.body.appendChild(box);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  try {
    // Required DOM nodes (fail gracefully if missing)
    const stage = qs("#stage");
    if (!stage) {
      showFatal("index.html is missing #stage. The deck renderer needs a container with id='stage'.");
      return;
    }

    // Load content.json (cache-busted)
    let content;
    try {
      const resp = await fetch(`./content.json?ts=${Date.now()}`, { cache: "no-store" });
      if (!resp.ok) throw new Error(`HTTP ${resp.status} while fetching content.json`);
      const text = await resp.text();
      try {
        content = JSON.parse(text);
      } catch (e) {
        throw new Error(`content.json is not valid JSON. Common cause: unescaped quotes inside strings.\n\n${e.message}`);
      }
    } catch (e) {
      showFatal("Could not load content.json.", e && e.message ? e.message : e);
      return;
    }

    // Validate schema
    const slides = Array.isArray(content.slides) ? content.slides : [];
    if (!slides.length) {
      showFatal("content.json loaded, but contains 0 slides. Expected: { slides: [ ... ] }", JSON.stringify(content, null, 2).slice(0, 1200));
      return;
    }

    // Theme mapping
    const themeMap = {
      pink: { accent: "#ff6ba6", accent2: "#ff9ccf", textOnAccent: "#ffffff" },
      purple: { accent: "#7c5cff", accent2: "#b39bff", textOnAccent: "#ffffff" },
      blue: { accent: "#2f7bff", accent2: "#79b2ff", textOnAccent: "#ffffff" },
      black: { accent: "#1f1f23", accent2: "#3a3a44", textOnAccent: "#ffffff" }
    };
    const tKey = String(content.theme || "pink").toLowerCase();
    const theme = themeMap[tKey] || themeMap.pink;

    document.documentElement.style.setProperty("--accent", theme.accent);
    document.documentElement.style.setProperty("--accent-2", theme.accent2);

    // Contrast class
    function hexToRgb(hex) {
      const h = hex.replace("#", "");
      return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)];
    }
    function lum(hex) {
      const [r, g, b] = hexToRgb(hex)
        .map((v) => v / 255)
        .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }
    const aLum = lum(theme.accent);
    document.body.classList.toggle("light-text", aLum > 0.5);
    document.body.classList.toggle("dark-text", aLum <= 0.5);

    // Render slides
    stage.innerHTML = "";
    slides.forEach((s, idx) => {
      const slide = document.createElement("section");
      slide.className = "slide";
      slide.setAttribute("data-index", String(idx));

      const card = document.createElement("div");
      card.className = "card";

      const header = document.createElement("div");
      header.className = "header-row";

      const hWrap = document.createElement("div");

      const h1 = document.createElement("h1");
      h1.textContent = s.title || "";
      hWrap.appendChild(h1);

      if (s.subtitle) {
        const h2 = document.createElement("h2");
        h2.textContent = s.subtitle;
        hWrap.appendChild(h2);
      }

      header.appendChild(hWrap);

      if (s.note) {
        const note = document.createElement("div");
        note.className = "note";
        note.textContent = s.note;
        header.appendChild(note);
      }

      card.appendChild(header);

      const contentWrap = document.createElement("div");
      contentWrap.className = "content";

      if (Array.isArray(s.body)) {
        let ul = null;
        s.body.forEach((par) => {
          if (typeof par !== "string") return;
          if (par.startsWith("• ") || par.startsWith("- ")) {
            if (!ul) {
              ul = document.createElement("ul");
              contentWrap.appendChild(ul);
            }
            const li = document.createElement("li");
            li.textContent = par.replace(/^•\s|-\s/, "");
            ul.appendChild(li);
          } else {
            const p = document.createElement("p");
            p.textContent = par;
            contentWrap.appendChild(p);
          }
        });
      }

      card.appendChild(contentWrap);

      slide.appendChild(card);
      stage.appendChild(slide);
    });

    // State
    let current = 0;
    const slideEls = qsa(".slide");
    const counter = qs("#counter"); // may be null depending on index.html
    const progressFill = qs("#progressFill"); // may be null

    function updateUI() {
      slideEls.forEach((el, i) => el.classList.toggle("visible", i === current));

      if (counter) counter.textContent = `${current + 1} / ${slideEls.length}`;
      if (progressFill) {
        const pct = Math.round(((current + 1) / slideEls.length) * 100);
        progressFill.style.width = `${pct}%`;
      }
    }

    function goto(n) {
      if (slideEls.length === 0) return;
      if (n < 0) n = 0;
      if (n >= slideEls.length) n = slideEls.length - 1;
      current = n;
      updateUI();
      const el = slideEls[current];
      if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    // Buttons (only attach if they exist)
    const prevBtn = qs("#prevBtn");
    const nextBtn = qs("#nextBtn");
    if (prevBtn) prevBtn.addEventListener("click", () => goto(current - 1));
    if (nextBtn) nextBtn.addEventListener("click", () => goto(current + 1));

    // Keyboard
    window.addEventListener("keydown", (e) => {
      if (e.key === " ") {
        e.preventDefault();
        goto(current + 1);
      } else if (e.key === "ArrowRight") goto(current + 1);
      else if (e.key === "ArrowLeft") goto(current - 1);
    });

    // Compact mode / stage height
    function refreshCompact() {
      document.body.classList.toggle("compact", window.innerHeight < 700);
      const topbar = qs(".topbar");
      if (topbar) {
        const topH = topbar.getBoundingClientRect().height;
        stage.style.height = `calc(100dvh - ${topH + 28}px)`;
      } else {
        stage.style.height = "100dvh";
      }
    }
    window.addEventListener("resize", refreshCompact);
    refreshCompact();

    // Init
    goto(0);

    // Export to PDF (only if button + libs exist)
    const exportBtn = qs("#exportPdf");
    const exportOverlay = qs("#exportOverlay");
    const exportStatus = qs("#exportStatus");
    const cancelExport = qs("#cancelExport");
    let cancelRequested = false;

    async function exportToPdf() {
      if (!window.jspdf || !window.html2canvas) {
        showFatal("PDF export libraries missing (jsPDF/html2canvas). Make sure index.html includes the CDN scripts.");
        return;
      }
      cancelRequested = false;
      document.body.classList.add("exporting");
      if (exportOverlay) exportOverlay.classList.remove("hidden");
      if (exportStatus) exportStatus.textContent = "Rendering slides to images...";

      await new Promise((r) => setTimeout(r, 60));

      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();

      for (let i = 0; i < slideEls.length; i++) {
        if (cancelRequested) break;
        goto(i);
        if (exportStatus) exportStatus.textContent = `Rendering slide ${i + 1} / ${slideEls.length} ...`;
        await new Promise((r) => setTimeout(r, 80));

        const el = slideEls[i];

        const cloned = el.cloneNode(true);
        cloned.style.position = "relative";
        cloned.style.transform = "none";
        cloned.style.opacity = "1";
        cloned.style.pointerEvents = "none";

        const temp = document.createElement("div");
        temp.style.position = "fixed";
        temp.style.left = "0";
        temp.style.top = "0";
        temp.style.width = window.innerWidth + "px";
        temp.style.height = window.innerHeight + "px";
        temp.style.overflow = "hidden";
        temp.style.zIndex = "99999";
        temp.style.background = getComputedStyle(document.body).background;
        temp.appendChild(cloned);
        document.body.appendChild(temp);

        const canvas = await html2canvas(cloned, { backgroundColor: null, useCORS: true, scale: 2 });
        const imgData = canvas.toDataURL("image/png");

        document.body.removeChild(temp);

        const pdfW = pageW;
        const pdfH = (canvas.height * pdfW) / canvas.width;
        const marginTop = Math.max(0, (pageH - pdfH) / 2);

        pdf.addImage(imgData, "PNG", 0, marginTop, pdfW, pdfH);
        if (i < slideEls.length - 1) pdf.addPage();
      }

      if (!cancelRequested) {
        if (exportStatus) exportStatus.textContent = "Finalizing PDF…";
        await new Promise((r) => setTimeout(r, 120));
        pdf.save((content.title || "presentation") + ".pdf");
      } else {
        if (exportStatus) exportStatus.textContent = "Export canceled";
      }

      document.body.classList.remove("exporting");
      setTimeout(() => exportOverlay && exportOverlay.classList.add("hidden"), 400);
    }

    if (exportBtn) exportBtn.addEventListener("click", exportToPdf);
    if (cancelExport) cancelExport.addEventListener("click", () => {
      cancelRequested = true;
      if (exportOverlay) exportOverlay.classList.add("hidden");
      document.body.classList.remove("exporting");
    });

    window.gotoSlide = goto;
  } catch (err) {
    showFatal("Unexpected error in app.js.", err && err.stack ? err.stack : err);
  }
})();
