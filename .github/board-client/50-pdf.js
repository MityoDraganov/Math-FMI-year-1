// PDF boxes behave like Obsidian's embedded pdf.js viewer (read-only): once the box is focused its
// pages scroll natively, the page input follows and jumps, zoom out/in and Ctrl/Cmd+wheel or a
// two-finger pinch zoom the pages (pdf.js's steps and rounding), "Open" opens the file in a new tab.
// Pages are pictures (board-pdf-pages.py); only the ones near the visible part are loaded.
;(window.__obsBoardExt = window.__obsBoardExt || []).push((board) => {
  const { t } = board
  const CSS_UNITS = 96 / 72, MIN = 0.1, MAX = 10, GAP = 10, BORDER = 4 // pdf.js / Obsidian values

  const pdfs = [...t.querySelectorAll(".canvas-node-pdf")].map((node) => {
    const vc = node.querySelector(".pdf-viewer-container"), viewer = node.querySelector(".pdfViewer")
    const nums = (node.dataset.pdfSizes || "").split(",").map(Number)
    const sizes = []
    for (let i = 0; i + 1 < nums.length; i += 2) sizes.push([nums[i], nums[i + 1]])
    const tmpl = node.dataset.pdfPages || ""
    const pages = sizes.map((_, i) => {
      if (i === 0) return { div: viewer.querySelector(".page"), img: viewer.querySelector(".page > img"), first: true }
      const div = document.createElement("div")
      div.className = "page"
      div.dataset.pageNumber = String(i + 1)
      viewer.append(div)
      return { div, img: null }
    })
    const input = node.querySelector(".pdf-page-input"), numbers = node.querySelector(".pdf-page-numbers")
    const p = { node, vc, sizes, pages, tmpl, input, numbers, paren: numbers?.textContent.startsWith("("), labels: node.dataset.pdfLabels ? JSON.parse(node.dataset.pdfLabels) : null, scale: 0, page: 1, tops: [], unusedTicks: 0, unusedFactor: 1, noZoomUntil: 0, frame: 0 }
    if (sizes.length) { layout(p); setPage(p, 1) }
    return p
  }).filter((p) => p.sizes.length)
  if (!pdfs.length) return

  // pdf.js "page-width": page 1 as wide as the viewer
  function layout(p) {
    if (!p.scale) {
      if (!p.vc.clientWidth) return // not laid out yet; retried when the board settles
      p.scale = p.vc.clientWidth / (p.sizes[0][0] * CSS_UNITS)
    }
    let top = 0
    p.tops = p.pages.map((pg, i) => {
      const [w, h] = p.sizes[i], W = w * CSS_UNITS * p.scale, H = h * CSS_UNITS * p.scale
      pg.div.style.width = W + "px"
      pg.div.style.height = H + "px"
      pg.w = W
      const at = top
      top += H + GAP + (i ? BORDER : 0)
      return at
    })
  }

  const pageAt = (p, y) => { let lo = 0, hi = p.tops.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (p.tops[m] <= y) lo = m; else hi = m - 1 } return lo }

  // pictures for the visible pages (focused: within one viewer height of them); the rest are
  // dropped. Nothing at overview zoom, where a page is a few device pixels wide.
  function load(p, onScreen) {
    const { o } = board.view(), dpr = window.devicePixelRatio || 1
    const st = p.vc.scrollTop, h = p.vc.clientHeight, m = p.node.classList.contains("is-focused") ? h : 0
    const show = onScreen && p.scale && p.pages[0].w * o * dpr > 200
    const from = show ? pageAt(p, st - m) : 1, to = show ? pageAt(p, st + h + m - 1) : 0
    p.pages.forEach((pg, i) => {
      if (pg.first) return
      if (i < from || i > to) {
        if (pg.img) { pg.img.removeAttribute("src"); pg.img.remove(); pg.img = null }
        return
      }
      const tier = pg.w * o * dpr > 1000 ? "l" : "m"
      if (!pg.img) {
        pg.img = document.createElement("img")
        pg.img.className = "pdf-page"
        pg.img.alt = ""
        pg.img.draggable = false
        pg.img.decoding = "async"
        pg.div.append(pg.img)
      }
      // only ever sharpen; going back to "m" while loaded would just load another picture
      if (pg.img.dataset.tier !== tier && pg.img.dataset.tier !== "l") {
        pg.img.dataset.tier = tier
        pg.img.src = p.tmpl.replace("m-002.png", `${tier}-${String(i + 1).padStart(3, "0")}.png`)
      }
    })
  }

  // pdf.js: the most visible page, unless the current one is still fully visible
  function current(p) {
    const st = p.vc.scrollTop, h = p.vc.clientHeight
    let best = p.page, bestPct = -1, keep = false
    for (let i = pageAt(p, st); i < p.pages.length && p.tops[i] < st + h; i++) {
      const top = p.tops[i] + (i ? BORDER : 0), H = p.sizes[i][1] * CSS_UNITS * p.scale
      const pct = Math.max(0, Math.min(top + H, st + h) - Math.max(top, st)) / H
      if (pct >= 1 && i + 1 === p.page) keep = true
      if (pct > bestPct) { bestPct = pct; best = i + 1 }
    }
    setPage(p, keep ? p.page : best)
  }
  function setPage(p, n, force) {
    p.page = n
    // pdf.js: with page labels the input shows the label and the counter "(n of N)"
    if (force || document.activeElement !== p.input) p.input.value = p.labels?.[n - 1] ?? String(n)
    if (p.paren) p.numbers.textContent = `(${n} of ${p.pages.length})`
  }

  const visible = (p) => {
    const r = p.node.getBoundingClientRect(), c = t.getBoundingClientRect()
    return r.right > c.left && r.left < c.right && r.bottom > c.top && r.top < c.bottom
  }
  const refresh = (p) => { p.frame = 0; if (!p.scale) layout(p); current(p); load(p, visible(p)) }
  const schedule = (p) => { if (!p.frame) p.frame = requestAnimationFrame(() => refresh(p)) }

  // pdf.js updateScale: keeps the point under `origin` (client coordinates) in place
  function setScale(p, scale, origin) {
    scale = Math.max(MIN, Math.min(MAX, scale))
    if (!p.scale || scale === p.scale) return
    const diff = scale / p.scale - 1, r = p.vc.getBoundingClientRect(), { o } = board.view()
    const x = origin ? (origin[0] - r.left) / o : p.vc.clientWidth / 2, y = origin ? (origin[1] - r.top) / o : p.vc.clientHeight / 2
    const sl = p.vc.scrollLeft, st = p.vc.scrollTop
    p.scale = scale
    layout(p)
    p.vc.scrollLeft = sl + (sl + x) * diff
    p.vc.scrollTop = st + (st + y) * diff
    schedule(p)
  }
  const step = (p, steps, origin) => {
    let n = p.scale
    const f = steps > 0 ? 1.1 : 1 / 1.1, round = steps > 0 ? Math.ceil : Math.floor
    let k = Math.abs(steps)
    do n = round((n * f).toFixed(2) * 10) / 10
    while (--k > 0 && n > MIN && n < MAX)
    setScale(p, n, origin)
  }
  const byFactor = (p, f, origin) => { if (f > 0 && f !== 1) setScale(p, Math.round(p.scale * f * 100) / 100, origin) }
  const accTicks = (p, v) => { if ((p.unusedTicks > 0 && v < 0) || (p.unusedTicks < 0 && v > 0)) p.unusedTicks = 0; p.unusedTicks += v; const i = Math.trunc(p.unusedTicks); p.unusedTicks -= i; return i }
  const accFactor = (p, f) => {
    if (f === 1) return 1
    if ((p.unusedFactor > 1 && f < 1) || (p.unusedFactor < 1 && f > 1)) p.unusedFactor = 1
    const a = Math.floor(p.scale * f * p.unusedFactor * 100) / (100 * p.scale)
    p.unusedFactor = f / a
    return a
  }

  const focusedPdf = (target) => {
    const n = target instanceof Element && target.closest(".canvas-node-pdf.is-focused")
    return n ? pdfs.find((p) => p.node === n) : null
  }

  for (const p of pdfs) {
    const on = (el, ev, fn, opt) => { el.addEventListener(ev, fn, opt); board.cleanup(() => el.removeEventListener(ev, fn, opt)) }
    on(p.vc, "scroll", () => schedule(p), { passive: true })
    on(p.input, "click", () => p.input.select())
    on(p.input, "change", () => {
      const i = p.labels ? p.labels.indexOf(p.input.value) : -1, n = i >= 0 ? i + 1 : parseInt(p.input.value, 10)
      if (n >= 1 && n <= p.pages.length) { p.vc.scrollTop = p.tops[n - 1]; setPage(p, n, true) } else setPage(p, p.page, true)
    })
    on(p.input, "keydown", (e) => { if (e.key === "Enter") p.input.blur(); e.stopPropagation() })
    const btn = (label, fn) => { const b = p.node.querySelector(`.pdf-toolbar [aria-label="${label}"]`); if (b) on(b, "click", fn) }
    btn("Zoom in", () => { p.unusedTicks = 0; step(p, 1) })
    btn("Zoom out", () => { p.unusedTicks = 0; step(p, -1) })
    btn("Open", () => window.open(p.node.querySelector(".canvas-file-link").href, "_blank", "noopener"))
  }

  // toolbar buttons and the page input of the focused box are clicked, not dragged
  board.hooks.pointerdown((e) => !!focusedPdf(e.target) && e.target.closest(".pdf-toolbar .clickable-icon, .pdf-page-input") !== null)

  // pdf.js onWheel: Ctrl/Cmd + wheel zooms the focused PDF (trackpad pinch by factor, wheel by
  // ticks of 30 px); for 1 s after a plain wheel scroll zooming is ignored
  board.hooks.wheel((e) => {
    const p = focusedPdf(e.target)
    if (!p || !e.target.closest(".pdf-container")) return false
    if (!(e.ctrlKey || e.metaKey)) { p.noZoomUntil = performance.now() + 1000; return false }
    e.preventDefault()
    if (performance.now() < p.noZoomUntil) return true
    const f = Math.exp(-e.deltaY / 100), origin = [e.clientX, e.clientY]
    if (e.ctrlKey && e.deltaMode === 0 && e.deltaX === 0 && Math.abs(f - 1) < 0.05) byFactor(p, accFactor(p, f), origin)
    else {
      let d = Math.hypot(e.deltaX, e.deltaY)
      const ang = Math.atan2(e.deltaY, e.deltaX)
      if (-0.25 * Math.PI < ang && ang < 0.75 * Math.PI) d = -d
      const ticks = e.deltaMode === 0 ? accTicks(p, d / 30) : Math.abs(d) >= 1 ? Math.sign(d) : accTicks(p, d)
      if (ticks) step(p, ticks, origin)
    }
    return true
  })

  // two fingers on the focused PDF pinch-zoom it (pdf.js TouchManager), not the board
  let pinch = null
  const mid = (a, b) => [(a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2]
  const dist = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
  board.hooks.touchstart((e) => {
    if (pinch) return true
    if (e.touches.length !== 2) return false
    const p = focusedPdf(e.touches[0].target), q = focusedPdf(e.touches[1].target)
    if (!p || p !== q || !e.touches[0].target.closest(".pdf-container") || !e.touches[1].target.closest(".pdf-container")) return false
    e.preventDefault()
    pinch = { p, d: dist(e.touches[0], e.touches[1]) }
    p.unusedFactor = 1
    return true
  })
  const move = (e) => {
    if (!pinch || e.touches.length !== 2) return
    if (e.cancelable) e.preventDefault()
    const d = dist(e.touches[0], e.touches[1])
    byFactor(pinch.p, accFactor(pinch.p, d / pinch.d), mid(e.touches[0], e.touches[1]))
    pinch.d = d
  }
  const end = (e) => { if (pinch && e.touches.length < 2) { pinch.p.unusedFactor = 1; pinch = null } }
  t.addEventListener("touchmove", move, { passive: false })
  t.addEventListener("touchend", end)
  t.addEventListener("touchcancel", end)
  board.cleanup(() => { t.removeEventListener("touchmove", move); t.removeEventListener("touchend", end); t.removeEventListener("touchcancel", end) })

  // board moved or zoomed: load what became visible (sharper if needed), drop what left the screen
  board.onSettle(() => { for (const p of pdfs) schedule(p) })
  // focus changes how far around the visible pages to load
  const onFocus = () => { for (const p of pdfs) schedule(p) }
  t.addEventListener("obs-focus", onFocus)
  board.cleanup(() => t.removeEventListener("obs-focus", onFocus))
})
