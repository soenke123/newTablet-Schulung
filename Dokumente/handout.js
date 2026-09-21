'use strict';

/* ==========================================
   State & DOM References
   ========================================== */
// sections/navBtns werden nach dem Ausblenden gesperrter Kapitel neu
// eingesammelt (rebuildIndex) – sonst zählt die Suche entfernte Kapitel mit.
let sections = [];
let navBtns  = [];
const searchInput  = document.getElementById('searchInput');
const searchClear  = document.getElementById('searchClear');
const resultsInfo  = document.getElementById('resultsInfo');
const noResults    = document.getElementById('noResults');
const siteHeader   = document.querySelector('.site-header');

// Cache original inner HTML before any modifications (needed to reset highlighting)
const originalHTML = new Map();

function rebuildIndex() {
  sections = Array.from(document.querySelectorAll('.chapter-section'));
  navBtns  = Array.from(document.querySelectorAll('.chapter-btn'));
  originalHTML.clear();
  sections.forEach(sec => {
    originalHTML.set(sec.id, sec.querySelector('.chapter-content-inner').innerHTML);
  });
}

rebuildIndex();

/* ==========================================
   Kapitel-Freischaltung nach Schulung (Backend-Session)
   ========================================== */
const SEASON_CHAPTERS = {
  2: ['ch-12', 'ch-13', 'ch-14', 'ch-15', 'ch-16', 'ch-17'],
  3: ['ch-18', 'ch-19', 'ch-20', 'ch-21', 'ch-22', 'ch-23', 'ch-24']
};

function applySeasonVisibility() {
  const season = typeof window.getUserSeason === 'function'
    ? (window.getUserSeason() || 1)
    : 1;

  Object.keys(SEASON_CHAPTERS).forEach(key => {
    const needed = Number(key);
    if (season >= needed) {
      // Kopfzeile und Fußzeile der Schulung einblenden
      ['eyebrow', 'foot'].forEach(part => {
        const el = document.getElementById(`s${needed}-${part}`);
        if (el) el.style.display = '';
      });
    } else {
      SEASON_CHAPTERS[needed].forEach(id => {
        document.getElementById(id)?.remove();
        document.querySelector(`.chapter-btn[data-target="${id}"]`)?.remove();
      });
    }
  });

  // Die "Neu"-Hervorhebung trägt immer nur die zuletzt freigeschaltete Schulung.
  if (season >= 3) {
    SEASON_CHAPTERS[2].forEach(id => {
      document.querySelector(`.chapter-btn[data-target="${id}"]`)
        ?.classList.remove('chapter-btn--new');
    });
    document.querySelectorAll('.chapter-btn--s3').forEach(btn => {
      btn.classList.add('chapter-btn--new');
    });
  }

  rebuildIndex();
}

if (window.waitForSession) {
  window.waitForSession().then(applySeasonVisibility);
} else {
  applySeasonVisibility();
}

/* ==========================================
   Accordion Helpers
   ========================================== */

function isOpen(id) {
  const content = document.querySelector(`#${id} .chapter-content`);
  return content ? content.dataset.open === 'true' : false;
}

function openSection(id, skipAnimation = false) {
  const section = document.getElementById(id);
  if (!section) return;
  const content = section.querySelector('.chapter-content');
  const inner   = section.querySelector('.chapter-content-inner');
  const btn     = document.querySelector(`.chapter-btn[data-target="${id}"]`);

  if (content.dataset.open === 'true') return;
  content.dataset.open = 'true';

  if (skipAnimation) {
    content.style.maxHeight = 'none';
    content.style.overflow  = 'visible';
  } else {
    // Ensure we start from 0 for the transition
    content.style.maxHeight = '0px';
    content.style.overflow  = 'hidden';
    // Force reflow so the transition fires
    content.offsetHeight;
    content.style.maxHeight = inner.scrollHeight + 'px';

    content.addEventListener('transitionend', function onEnd() {
      if (content.dataset.open === 'true') {
        content.style.maxHeight = 'none';
        content.style.overflow  = 'visible';
      }
      content.removeEventListener('transitionend', onEnd);
    });
  }

  if (btn) {
    btn.classList.add('active');
    btn.setAttribute('aria-expanded', 'true');
  }
}

function closeSection(id) {
  const section = document.getElementById(id);
  if (!section) return;
  const content = section.querySelector('.chapter-content');
  const btn     = document.querySelector(`.chapter-btn[data-target="${id}"]`);

  if (content.dataset.open !== 'true') return;
  content.dataset.open = 'false';

  // If max-height is 'none' we need a finite starting value before animating to 0
  content.style.overflow  = 'hidden';
  content.style.maxHeight = content.scrollHeight + 'px';

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      content.style.maxHeight = '0px';
    });
  });

  if (btn) {
    btn.classList.remove('active');
    btn.setAttribute('aria-expanded', 'false');
  }
}

function scrollToSection(id) {
  const section = document.getElementById(id);
  if (!section) return;
  const headerH = siteHeader ? siteHeader.offsetHeight : 0;
  const top = section.getBoundingClientRect().top + window.pageYOffset - headerH - 12;
  window.scrollTo({ top, behavior: 'smooth' });
}

/* ==========================================
   Accordion Click Handler
   ========================================== */
navBtns.forEach(btn => {
  btn.setAttribute('aria-expanded', 'false');

  btn.addEventListener('click', () => {
    const id = btn.dataset.target;
    if (isOpen(id)) {
      closeSection(id);
    } else {
      // Accordion: alle anderen schließen, außer bei aktiver Suche
      if (!searchInput.value.trim()) {
        sections.forEach(sec => { if (sec.id !== id) closeSection(sec.id); });
      }
      openSection(id);
      setTimeout(() => scrollToSection(id), 30);
    }
  });
});

/* ==========================================
   Text Highlighting
   ========================================== */
function highlightNode(container, term) {
  if (!term) return;
  const lower = term.toLowerCase();

  // Collect all text nodes first (TreeWalker is live, so collect then iterate)
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const nodes  = [];
  let n;
  while ((n = walker.nextNode())) nodes.push(n);

  nodes.forEach(textNode => {
    const text     = textNode.textContent;
    const textLow  = text.toLowerCase();
    if (!textLow.includes(lower)) return;

    const frag = document.createDocumentFragment();
    let start = 0;
    let idx;

    while ((idx = textLow.indexOf(lower, start)) !== -1) {
      if (idx > start) {
        frag.appendChild(document.createTextNode(text.slice(start, idx)));
      }
      const mark = document.createElement('mark');
      mark.className = 'highlight';
      mark.textContent = text.slice(idx, idx + term.length);
      frag.appendChild(mark);
      start = idx + term.length;
    }

    if (start < text.length) {
      frag.appendChild(document.createTextNode(text.slice(start)));
    }

    textNode.parentNode.replaceChild(frag, textNode);
  });
}

/* ==========================================
   Live Search
   ========================================== */
function performSearch(rawTerm) {
  const term  = rawTerm.trim();
  const lower = term.toLowerCase();
  let matches = 0;

  sections.forEach(sec => {
    const inner = sec.querySelector('.chapter-content-inner');
    const id    = sec.id;
    const btn   = document.querySelector(`.chapter-btn[data-target="${id}"]`);

    // Always restore original HTML first (clears old marks)
    inner.innerHTML = originalHTML.get(id);

    if (!lower) {
      // Empty query → show all, keep current open/close state unchanged
      sec.classList.remove('hidden');
      if (btn) btn.classList.remove('dim');
      return;
    }

    // Search in button text (chapter title) AND inner content text
    const btnText      = btn ? btn.textContent.toLowerCase() : '';
    const contentText  = inner.textContent.toLowerCase();
    const found        = contentText.includes(lower) || btnText.includes(lower);

    if (found) {
      matches++;
      sec.classList.remove('hidden');
      if (btn) btn.classList.remove('dim');

      // Open and highlight
      const content      = sec.querySelector('.chapter-content');
      content.dataset.open = 'false'; // reset so openSection runs fresh
      content.style.maxHeight = '0px';
      content.style.overflow  = 'hidden';
      openSection(id, true); // skip animation for instant reveal
      highlightNode(inner, term);
    } else {
      sec.classList.add('hidden');
      if (btn) btn.classList.add('dim');
    }
  });

  if (lower) {
    resultsInfo.textContent = matches === 0
      ? 'Keine Kapitel gefunden'
      : `${matches} von ${sections.length} Kapiteln gefunden`;
    noResults.classList.toggle('visible', matches === 0);
  } else {
    resultsInfo.textContent = '';
    noResults.classList.remove('visible');

    // Panels that were open via search already have max-height: none.
    // After HTML restore (no highlights), just ensure they stay fully visible.
    sections.forEach(sec => {
      const content = sec.querySelector('.chapter-content');
      if (content.dataset.open === 'true') {
        content.style.maxHeight = 'none';
        content.style.overflow  = 'visible';
      }
    });
  }
}

searchInput.addEventListener('input', () => {
  const val = searchInput.value;
  searchClear.classList.toggle('visible', val.length > 0);
  performSearch(val);
});

searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchClear.classList.remove('visible');
  performSearch('');
  searchInput.focus();
});

searchInput.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    searchInput.value = '';
    searchClear.classList.remove('visible');
    performSearch('');
  }
});
