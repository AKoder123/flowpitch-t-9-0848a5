// app.js — Presentation runner
(async function(){
  // Helpers
  function qs(sel, root=document){ return root.querySelector(sel) }
  function qsa(sel, root=document){ return Array.from((root||document).querySelectorAll(sel)) }

  // Load content.json
  const contentResp = await fetch('content.json');
  const content = await contentResp.json();

  // Theme mapping
  const themeMap = {
    pink: {accent:'#ff6ba6', accent2:'#ff9ccf', textOnAccent:'#ffffff'}
  };
  const theme = themeMap[(content.theme||'pink').toLowerCase()] || themeMap.pink;

  // Apply accent color to CSS variables
  document.documentElement.style.setProperty('--accent', theme.accent);
  document.documentElement.style.setProperty('--accent-2', theme.accent2);

  // Simple luminance check to decide text color over accent
  function hexToRgb(hex){
    const h = hex.replace('#','');
    return [parseInt(h.substring(0,2),16),parseInt(h.substring(2,4),16),parseInt(h.substring(4,6),16)];
  }
  function lum(hex){
    const [r,g,b] = hexToRgb(hex).map(v=>v/255).map(v=> v<=0.03928? v/12.92: Math.pow((v+0.055)/1.055,2.4));
    return 0.2126*r + 0.7152*g + 0.0722*b;
  }
  const aLum = lum(theme.accent);
  if(aLum > 0.5){ document.body.classList.add('light-text') } else { document.body.classList.add('dark-text') }

  // Render slides
  const stage = qs('#stage');
  const slides = content.slides || [];

  slides.forEach((s, idx)=>{
    const slide = document.createElement('section');
    slide.className = 'slide';
    slide.setAttribute('data-index', idx);
    // build inner structure
    const card = document.createElement('div'); card.className='card';
    const header = document.createElement('div'); header.className='header-row';
    const h = document.createElement('div');
    const h1 = document.createElement('h1'); h1.textContent = s.title || '';
    h.appendChild(h1);
    if(s.subtitle){
      const h2 = document.createElement('h2'); h2.textContent = s.subtitle; h.appendChild(h2);
    }
    header.appendChild(h);
    if(s.note){
      const note = document.createElement('div'); note.className='note'; note.textContent = s.note; header.appendChild(note);
    }
    card.appendChild(header);

    const contentWrap = document.createElement('div'); contentWrap.className='content';
    if(Array.isArray(s.body)){
      s.body.forEach(par =>{
        if(typeof par === 'string'){
          // simple markdown-like bullets
          if(par.startsWith('• ') || par.startsWith('- ')){
            const ul = contentWrap.querySelector('ul') || document.createElement('ul');
            if(!contentWrap.contains(ul)) contentWrap.appendChild(ul);
            const li = document.createElement('li'); li.textContent = par.replace(/^•\s|-\s/, ''); ul.appendChild(li);
          } else {
            const p = document.createElement('p'); p.textContent = par; contentWrap.appendChild(p);
          }
        }
      })
    }
    card.appendChild(contentWrap);

    // tiny footer row
    const footerRow = document.createElement('div'); footerRow.className='small'; footerRow.style.display='flex'; footerRow.style.justifyContent='space-between'; footerRow.style.alignItems='center';
    const slideNum = document.createElement('div'); slideNum.textContent = (idx+1) + ' / ' + slides.length;
    const hint = document.createElement('div'); hint.textContent = 'Space / → Next • ← Prev';
    footerRow.appendChild(slideNum); footerRow.appendChild(hint);
    card.appendChild(footerRow);

    slide.appendChild(card);
    stage.appendChild(slide);
  });

  // State
  let current = 0;
  const slideEls = qsa('.slide');
  const counter = qs('#counter');
  const progressFill = qs('#progressFill');

  function updateUI(){
    slideEls.forEach((el,i)=> el.classList.toggle('visible', i===current));
    counter.textContent = (current+1) + ' / ' + slideEls.length;
    const pct = Math.round(((current+1)/slideEls.length)*100);
    progressFill.style.width = pct + '%';
  }

  function goto(n){
    if(n < 0) n = 0; if(n >= slideEls.length) n = slideEls.length-1;
    current = n; updateUI();
    // ensure visible slide is focused for accessibility
    const el = slideEls[current]; if(el) el.scrollIntoView({behavior:'smooth',block:'nearest'});
  }

  // Buttons
  qs('#prevBtn').addEventListener('click', ()=> goto(current-1));
  qs('#nextBtn').addEventListener('click', ()=> goto(current+1));

  // Keyboard
  window.addEventListener('keydown', (e)=>{
    if(e.key === ' '){ e.preventDefault(); goto(current+1); }
    else if(e.key === 'ArrowRight'){ goto(current+1); }
    else if(e.key === 'ArrowLeft'){ goto(current-1); }
  });

  // Compact mode: add class when viewport height small
  function refreshCompact(){
    if(window.innerHeight < 700){ document.body.classList.add('compact') }
    else document.body.classList.remove('compact');
    // adjust stage height to always be 100dvh minus topbar height
    const topbar = qs('.topbar');
    const topH = topbar.getBoundingClientRect().height;
    stage.style.height = `calc(100dvh - ${topH + 28}px)`; // keep some breathing
  }
  window.addEventListener('resize', refreshCompact);
  refreshCompact();

  // Initialize
  goto(0);

  // Export to PDF
  const exportBtn = qs('#exportPdf');
  const exportOverlay = qs('#exportOverlay');
  const exportStatus = qs('#exportStatus');
  const cancelExport = qs('#cancelExport');
  let cancelRequested = false;

  async function exportToPdf(){
    cancelRequested = false;
    document.body.classList.add('exporting');
    exportOverlay.classList.remove('hidden');
    exportStatus.textContent = 'Rendering slides to images...';

    // Wait a tick so CSS changes apply
    await new Promise(r=>setTimeout(r,60));

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({unit:'mm',format:'a4',compress:true});
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();

    for(let i=0;i<slideEls.length;i++){
      if(cancelRequested) break;
      goto(i);
      exportStatus.textContent = `Rendering slide ${i+1} / ${slideEls.length} ...`;
      // allow DOM update
      await new Promise(r=>setTimeout(r,80));
      const el = slideEls[i];

      // clone and ensure full rendering without transforms
      const cloned = el.cloneNode(true);
      cloned.style.position='relative'; cloned.style.transform='none'; cloned.style.opacity='1'; cloned.style.pointerEvents='none';
      // make a temp container
      const temp = document.createElement('div'); temp.style.position='fixed'; temp.style.left='0'; temp.style.top='0'; temp.style.width = window.innerWidth + 'px'; temp.style.height = window.innerHeight + 'px'; temp.style.overflow='hidden'; temp.style.zIndex = '99999'; temp.style.background = getComputedStyle(document.body).background;
      temp.appendChild(cloned);
      document.body.appendChild(temp);

      // scale up for quality
      const canvas = await html2canvas(cloned, {backgroundColor: null, useCORS:true, scale:2});
      const imgData = canvas.toDataURL('image/png');

      // cleanup
      document.body.removeChild(temp);

      // Calculate image fit to pdf page
      const imgProps = {width: canvas.width, height: canvas.height};
      const pdfW = pageW; const pdfH = (imgProps.height * pdfW) / imgProps.width;
      // center vertically if shorter
      const marginTop = Math.max(0, (pageH - pdfH) / 2);
      pdf.addImage(imgData, 'PNG', 0, marginTop, pdfW, pdfH);
      if(i < slideEls.length -1) pdf.addPage();
    }

    if(!cancelRequested){
      exportStatus.textContent = 'Finalizing PDF…';
      await new Promise(r=>setTimeout(r,120));
      pdf.save((content.title||'presentation') + '.pdf');
    } else {
      exportStatus.textContent = 'Export canceled';
    }

    document.body.classList.remove('exporting');
    setTimeout(()=> exportOverlay.classList.add('hidden'), 400);
  }

  exportBtn.addEventListener('click', ()=> exportToPdf());
  cancelExport.addEventListener('click', ()=> { cancelRequested = true; exportOverlay.classList.add('hidden'); document.body.classList.remove('exporting'); });

  // expose goto on window for debugging
  window.gotoSlide = goto;

})();
