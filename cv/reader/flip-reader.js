/*
 * flip-reader.js — a small reusable layer on top of StPageFlip.
 *
 * Turns folders of page images into a full-screen, multi-book flip reader.
 * You never edit this file; configure it from your HTML:
 *
 *   PageFlipReader.start({
 *     books:      ['magazine', 'travel'],  // folder names = url slugs = titles
 *     basePath:   'books',                 // parent folder of the book folders
 *     sideBuffer: 0.10,                    // empty room L/R, fraction of screen WIDTH
 *     topBuffer:  0.08,                     // empty room T/B, fraction of screen HEIGHT
 *     pageBorder: { color: '#666', width: 2 },  // optional page outline (stroke), like a
 *                                               // CAD rectangle: color + weight in px
 *     fillers: false,                          // only if your books have NO background-
 *                                              // coloured filler first/last pages
 *     pageStack: { leaf: 2, color: '#d9d9d9', max: 26 },
 *                                              // "book weight": stacked page edges beside
 *                                              // the open spread, mirroring your position.
 *                                              // leaf = px per remaining leaf, max = cap px.
 *                                              // Hidden on the cover/back-cover spreads.
 *     gutterShadow: 0.22,                      // soft shading at the centre fold (0..1)
 *     single:     false,                       // one landscape page per view (no two-up
 *                                              // spread): each sheet fills the screen and
 *                                              // flips on its own. For landscape booklets.
 *     pageAspect: 1233 / 884,                  // page width/height ratio when single:true
 *   });
 *
 * Each book folder holds page-01.png, page-02.png, ... (zero-padded, no gaps).
 * Books are linkable: .../index.html#travel opens that book; back/forward works.
 *
 * Depends on: window.St.PageFlip  (load page-flip.browser.js first).
 */
(function (global) {
  'use strict';

  var SPREAD = 420 / 297; // two A4 pages side by side = the fixed booklet shape

  // ---------------------------------------------------------------------------
  // Auto-discovery: find page-01.png, page-02.png, ... by probing the filenames.
  // (Static hosting can't list a folder, so we ask for files until one is missing.)
  // ---------------------------------------------------------------------------
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  // Probe one filename. Using <img> (not fetch): it works on file:// too, and a
  // hit warms the browser cache so the real page load is instant.
  function probe(url) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () { resolve(true); };
      img.onerror = function () { resolve(false); };
      img.src = url;
    });
  }

  // Discover a book's pages. The scheme is auto-detected from page 1 so common
  // variations just work: separator "-" or "_", and extension png/jpg/jpeg/webp.
  // (Within ONE book the naming must be consistent — the scheme is locked from
  // page 1.) Then the count is found with exponential + binary search (~log2(N)).
  function discoverPages(folder, opts) {
    opts = opts || {};
    var CAP = opts.max || 500;
    var SEPS = ['-', '_'];
    var EXTS = ['png', 'jpg', 'jpeg', 'webp'];

    // candidate schemes, default (page-01.png) first so standard books cost nothing
    var schemes = [];
    [true, false].forEach(function (pad) {           // zero-padded first
      SEPS.forEach(function (sep) {
        EXTS.forEach(function (ext) { schemes.push({ sep: sep, pad: pad, ext: ext }); });
      });
    });
    function url(s, n) { return folder + '/page' + s.sep + (s.pad ? pad2(n) : n) + '.' + s.ext; }

    // probe page-1 candidates in order; the first that exists locks the scheme
    function detect(i) {
      if (i >= schemes.length) return null;
      return probe(url(schemes[i], 1)).then(function (ok) {
        return ok ? schemes[i] : detect(i + 1);
      });
    }

    return Promise.resolve(detect(0)).then(function (scheme) {
      if (!scheme) return [];                        // no page 1 in any scheme -> empty
      var lo = 1, hi = 2;                            // invariant: lo exists, hi does not
      function grow() {
        if (hi > CAP) { hi = CAP + 1; return; }
        return probe(url(scheme, hi)).then(function (ok) {
          if (ok) { lo = hi; hi *= 2; return grow(); }
        });
      }
      function bisect(low, high) {                   // last existing page in (low, high)
        if (high - low <= 1) return low;
        var mid = Math.floor((low + high) / 2);
        return probe(url(scheme, mid)).then(function (ok) {
          return ok ? bisect(mid, high) : bisect(low, mid);
        });
      }
      return Promise.resolve(grow())
        .then(function () { return bisect(lo, hi); })
        .then(function (last) {
          var pages = [];
          for (var n = 1; n <= last; n++) pages.push(url(scheme, n));
          return pages;
        });
    });
  }

  // ---------------------------------------------------------------------------
  // Sizing: largest A4 booklet that fits in the screen MINUS the buffers.
  // The leftover (the buffers) is the empty room the page flip sweeps into.
  // ---------------------------------------------------------------------------
  function computeBookletSize(sideBuffer, topBuffer) {
    var availW = global.innerWidth * (1 - 2 * sideBuffer);
    var availH = global.innerHeight * (1 - 2 * topBuffer);
    var w, h;
    if (availW / availH > SPREAD) { h = availH; w = availH * SPREAD; }
    else { w = availW; h = availW / SPREAD; }
    return { pageW: Math.round(w / 2), bookletH: Math.round(h) };
  }

  // Single-page mode: the largest page of a given aspect (width/height) that
  // fits the screen minus the buffers. Used for landscape booklets — each sheet
  // is shown on its own (no two-up spread) and flips one page at a time.
  function computeSingleSize(aspect, sideBuffer, topBuffer) {
    var availW = global.innerWidth * (1 - 2 * sideBuffer);
    var availH = global.innerHeight * (1 - 2 * topBuffer);
    var w = availW, h = w / aspect;
    if (h > availH) { h = availH; w = h * aspect; }
    return { pageW: Math.round(w), pageH: Math.round(h) };
  }

  // ---------------------------------------------------------------------------
  // The reader
  // ---------------------------------------------------------------------------
  function start(config) {
    config = config || {};
    var books = config.books || [];
    var basePath = String(config.basePath || 'books').replace(/\/+$/, '');
    var sideBuffer = config.sideBuffer != null ? config.sideBuffer : 0.10;
    var topBuffer = config.topBuffer != null ? config.topBuffer : 0.08;
    var pageBorder = config.pageBorder || null;
    var single = !!config.single;                    // one page per view (landscape sheets)
    var pageAspect = config.pageAspect || SPREAD;    // page width/height ratio in single mode
    var titles = config.titles || {};
    var el = document.getElementById(config.element || 'book');

    if (!global.St || !global.St.PageFlip) { console.error('[flip-reader] StPageFlip not loaded.'); return; }
    if (!el) { console.error('[flip-reader] container element not found.'); return; }
    if (!books.length) { showMessage(el, 'No books configured.'); return; }

    var pageFlip = null;
    var current = null;
    var nav = makeNav();

    function folderFor(slug) { return basePath + '/' + slug; }
    function titleFor(slug) { return titles[slug] || slug.charAt(0).toUpperCase() + slug.slice(1); }
    function slugFromHash() { return decodeURIComponent((location.hash || '').replace(/^#/, '')); }

    function showOrUpdate(pages) {
      // The documented cover workaround: the first and last page of every book are
      // background-coloured fillers standing in for the covers. The engine needs to
      // know them: fillers get no border, and a flip landing on one leaves the slot
      // empty instead of wiping the old page with a background-coloured wedge.
      // Books whose first/last pages are real content can opt out: fillers: false.
      var fillers = (!single && config.fillers !== false) ? [0, pages.length - 1] : [];
      if (pageFlip) pageFlip.getSettings().pageFillers = fillers;
      if (!pageFlip) {
        var settings;
        if (single) {
          // One landscape page per view. StPageFlip's single-page ("portrait")
          // path is forced on ANY screen width by keeping minWidth above half the
          // container width; the page is sized from its aspect ratio (no spread,
          // no centre fold, no cover-filler pairing).
          var ss = computeSingleSize(pageAspect, sideBuffer, topBuffer);
          settings = {
            width: Math.round(1000 * pageAspect), height: 1000, // shape = aspect
            size: 'stretch',
            minWidth: global.innerWidth + 1,   // > blockWidth/2 -> always single page
            maxWidth: ss.pageW,
            minHeight: 1, maxHeight: ss.pageH,
            pageFillers: [],
            gutterShadow: 0,
            usePortrait: true
          };
        } else {
          var size = computeBookletSize(sideBuffer, topBuffer);
          settings = {
            width: 210, height: 297,   // one A4 page shape (fixed)
            size: 'stretch',
            minWidth: 50, maxWidth: size.pageW,
            minHeight: 70, maxHeight: size.bookletH,
            pageFillers: fillers,   // indices of the background-coloured filler pages
            gutterShadow: config.gutterShadow || 0, // centre-fold shading 0..1
            usePortrait: false
          };
        }
        pageFlip = new global.St.PageFlip(el, Object.assign({
          autoSize: false,
          showCover: false,
          pageBorder: pageBorder, // optional CAD-style outline: { color, width }
          pageStack: single ? null : (config.pageStack || null), // "book weight" edges
          maxShadowOpacity: 0.5,
          flippingTime: 800,
          mobileScrollSupport: false
        }, settings));
        pageFlip.loadFromImages(pages);
        global.PageFlipReader.current = pageFlip; // live engine handle (debugging/power users)
      } else {
        pageFlip.updateFromImages(pages); // swap book in place (all books share A4 size)
        pageFlip.turnToPage(0);           // reset to the cover
      }
    }

    function openBook(slug) {
      if (books.indexOf(slug) === -1) slug = books[0];
      current = slug;
      document.title = titleFor(slug);
      updateNav();
      discoverPages(folderFor(slug), config).then(function (pages) {
        if (!pages.length) { showMessage(el, 'No pages found in "' + slug + '".'); return; }
        clearMessage(el);
        showOrUpdate(pages);
      });
    }

    // navigation: a hash change is the single source of truth for "which book"
    function goToSlug(slug) {
      if (slugFromHash() === slug) openBook(slug);   // same hash -> open directly
      else location.hash = encodeURIComponent(slug); // else let hashchange drive it
    }
    function stepBook(delta) {
      var i = books.indexOf(current);
      if (i === -1) i = 0;
      goToSlug(books[(i + delta + books.length) % books.length]);
    }

    function updateNav() {
      var multi = books.length > 1;
      nav.prev.style.display = nav.next.style.display = multi ? '' : 'none';
    }

    nav.prev.addEventListener('click', function () { stepBook(-1); });
    nav.next.addEventListener('click', function () { stepBook(1); });

    global.addEventListener('hashchange', function () { openBook(slugFromHash()); });

    // page navigation with the arrow keys (book navigation uses the buttons)
    document.addEventListener('keydown', function (e) {
      if (!pageFlip) return;
      if (e.key === 'ArrowLeft') pageFlip.flipPrev();
      if (e.key === 'ArrowRight') pageFlip.flipNext();
    });

    // page size is fixed at build time in StPageFlip; re-run the math on resize
    // by reloading (the hash preserves the current book; images are cached)
    var rt;
    global.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () { location.reload(); }, 400);
    });

    // boot: open the book named in the URL, or the first one
    var initial = slugFromHash();
    openBook(books.indexOf(initial) !== -1 ? initial : books[0]);

    return {
      open: goToSlug,
      next: function () { stepBook(1); },
      prev: function () { stepBook(-1); },
      goToPage: function (n) { if (pageFlip) pageFlip.turnToPage(n); } // 0-based, instant
    };
  }

  // ---------------------------------------------------------------------------
  // Tiny UI bits (self-contained so the host HTML stays minimal). Override the
  // .pfr-* classes in your own CSS if you want a different look.
  // ---------------------------------------------------------------------------
  function makeNav() {
    injectStyleOnce();
    var prev = button('‹', 'pfr-prev', 'Previous book');
    var next = button('›', 'pfr-next', 'Next book');
    document.body.appendChild(prev);
    document.body.appendChild(next);
    return { prev: prev, next: next };
  }
  function button(label, cls, title) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'pfr-nav ' + cls;
    b.title = title;
    b.setAttribute('aria-label', title);
    b.textContent = label;
    return b;
  }
  function showMessage(el, text) {
    var m = el.querySelector('.pfr-message') || document.createElement('div');
    m.className = 'pfr-message';
    m.textContent = text;
    if (!m.parentNode) document.body.appendChild(m);
  }
  function clearMessage(el) {
    var m = document.querySelector('.pfr-message');
    if (m) m.remove();
  }
  function injectStyleOnce() {
    if (document.getElementById('pfr-style')) return;
    var s = document.createElement('style');
    s.id = 'pfr-style';
    s.textContent =
      '.pfr-nav{position:fixed;top:50%;transform:translateY(-50%);z-index:50;' +
      'width:48px;height:64px;border:none;background:none;padding:0;cursor:pointer;' +
      'font-size:44px;line-height:1;color:rgba(255,255,255,.6);' +
      'text-shadow:0 0 8px rgba(0,0,0,.7);transition:color .15s ease}' +
      '.pfr-nav:hover{color:#fff}' +
      '.pfr-prev{left:16px}.pfr-next{right:16px}' +
      '.pfr-message{position:fixed;inset:0;display:flex;align-items:center;' +
      'justify-content:center;color:#888;font:16px/1.4 system-ui,sans-serif;' +
      'pointer-events:none}';
    document.head.appendChild(s);
  }

  global.PageFlipReader = { start: start, discoverPages: discoverPages };
})(window);
