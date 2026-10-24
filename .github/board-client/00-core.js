// Board (Табло.canvas) client: view state, pan/zoom gestures, controls. Replaces the canvas-page
// plugin's own script (quartz-obsidian.mjs concatenates the files in .github/board-client/ in
// name order). Behaviour follows Obsidian 1.14's canvas; numbers are Obsidian's unless noted.
//
// Features live in separate files and register with window.__obsBoardExt.push((board) => {...}).
// The board API they get:
//   board.t, board.M            container (.canvas-container) and transformed layer (.canvas-viewport)
//   board.view()                {c, a, o}: screen translation (px) and scale
//   board.setView(c, a, o)      set the view (applied on the next frame)
//   board.zoomAt(f, x, y)       multiply the scale by f around a container point
//   board.toCanvas(x, y)        container point -> canvas (layer) coordinates
//   board.onSettle(fn)          after the view has been still for 150 ms
//   board.onFrame(fn)           every frame the view changed
//   board.hooks.wheel(e)        return true when the extension handled the event
//   board.hooks.pointerdown(e)  return true to keep the board from panning
//   board.hooks.touchstart(e)   return true to keep the board from panning/pinching
//   board.cleanup(fn)           run when Quartz navigates away (SPA)
;(() => {
  const exts = (window.__obsBoardExt = window.__obsBoardExt || [])
  const MIN_ZOOM = 0.0625, MAX_ZOOM = 2 // Obsidian: zoom level 2^-4 … 2^1

  function init(t) {
    if (t.dataset.initialized === "true") return
    t.dataset.initialized = "true"
    const M = t.querySelector(".canvas-viewport")
    if (!M) return
    const ox = parseFloat(M.dataset.ox) || 0, oy = parseFloat(M.dataset.oy) || 0
    let c = 0, a = 0, o = 1
    const cleanups = [], settleFns = [], frameFns = []
    const hooks = { wheel: [], pointerdown: [], touchstart: [] }
    const on = (el, ev, fn, opt) => { el.addEventListener(ev, fn, opt); cleanups.push(() => el.removeEventListener(ev, fn, opt)) }
    const clamp = (v) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v))

    // one update per frame; label size etc. once the view settles (Obsidian defers the same work)
    let raf = 0, settleTimer = 0
    const apply = () => {
      raf = 0
      M.style.transform = `translate(${c}px, ${a}px) scale(${o})`
      for (const fn of frameFns) fn()
      clearTimeout(settleTimer)
      settleTimer = setTimeout(settle, 150)
    }
    const update = () => { if (!raf) raf = requestAnimationFrame(apply) }
    let settledScale = 0
    const settle = () => {
      if (settledScale !== o) {
        // re-rasterize the board layer once at the new scale so text is sharp
        settledScale = o
        M.style.willChange = "auto"
        requestAnimationFrame(() => requestAnimationFrame(() => (M.style.willChange = "transform")))
      }
      t.style.setProperty("--zoom-multiplier", String(Math.sqrt(1 / o)))
      t.classList.toggle("mod-zoomed-out", Math.log2(o) <= -1.7)
      for (const fn of settleFns) fn()
    }

    const board = {
      t, M,
      view: () => ({ c, a, o }),
      setView: (nc, na, no) => { c = nc; a = na; o = no; update() },
      zoomAt: (f, x, y) => { const p = o; o = clamp(o * f); c = x - (x - c) * (o / p); a = y - (y - a) * (o / p); update() },
      toCanvas: (x, y) => ({ x: (x - c) / o - ox, y: (y - a) / o - oy }),
      onSettle: (fn) => settleFns.push(fn),
      onFrame: (fn) => frameFns.push(fn),
      hooks: { wheel: (fn) => hooks.wheel.push(fn), pointerdown: (fn) => hooks.pointerdown.push(fn), touchstart: (fn) => hooks.touchstart.push(fn) },
      cleanup: (fn) => cleanups.push(fn),
      clamp,
    }
    const handled = (list, e) => list.some((fn) => fn(e))

    // Obsidian's zoom-to-fit: 10% margin, never above 100%, centered
    const fit = () => {
      const r = t.getBoundingClientRect()
      const w = (parseFloat(M.style.width) || 1000) - 100, h = (parseFloat(M.style.height) || 1000) - 100
      o = clamp(Math.min(r.width / (1.1 * w), r.height / (1.1 * h), 1))
      c = (r.width - (w + 100) * o) / 2
      a = (r.height - (h + 100) * o) / 2
      update()
    }
    fit()
    M.style.willChange = "transform"

    // mouse / single-touch drag pans the board
    let drag = null
    on(t, "pointerdown", (e) => {
      if (e.button !== 0 || (e.target instanceof Element && e.target.closest("a, button, input, .canvas-controls"))) return
      if (handled(hooks.pointerdown, e)) return
      drag = { id: e.pointerId, x: e.clientX - c, y: e.clientY - a }
      t.setPointerCapture(e.pointerId)
    })
    on(t, "pointermove", (e) => { if (drag && e.pointerId === drag.id) { c = e.clientX - drag.x; a = e.clientY - drag.y; update() } })
    const end = (e) => { if (drag && e.pointerId === drag.id) drag = null }
    on(t, "pointerup", end)
    on(t, "pointercancel", end)

    // two fingers: pinch zoom around the midpoint, and pan with it
    let pinch = null
    const dist = (p, q) => Math.hypot(p.clientX - q.clientX, p.clientY - q.clientY)
    on(t, "touchstart", (e) => {
      if (handled(hooks.touchstart, e)) return
      if (e.touches.length === 2) {
        e.preventDefault()
        drag = null
        const [p, q] = e.touches
        pinch = { d: dist(p, q), x: (p.clientX + q.clientX) / 2, y: (p.clientY + q.clientY) / 2 }
      }
    }, { passive: false })
    on(t, "touchmove", (e) => {
      if (!pinch || e.touches.length !== 2) return
      e.preventDefault()
      const [p, q] = e.touches, r = t.getBoundingClientRect()
      const d = dist(p, q), x = (p.clientX + q.clientX) / 2, y = (p.clientY + q.clientY) / 2
      board.zoomAt(d / pinch.d, x - r.left, y - r.top)
      c += x - pinch.x
      a += y - pinch.y
      pinch = { d, x, y }
    }, { passive: false })
    on(t, "touchend", (e) => { if (e.touches.length < 2) pinch = null })

    // Obsidian's wheel: scrolling pans (x0.93); ctrl/cmd + wheel and trackpad pinch zoom by 2^(-dy/300)
    on(t, "wheel", (e) => {
      if (handled(hooks.wheel, e)) return
      e.preventDefault()
      let dx = e.deltaX, dy = e.deltaY
      if (e.deltaMode === 1) { dx *= 40; dy *= 40 } else if (e.deltaMode === 2) { dx *= 800; dy *= 800 }
      if (e.ctrlKey || e.metaKey) {
        const r = t.getBoundingClientRect()
        let z = -dy / 300
        if (/Mac/.test(navigator.platform) && !Number.isInteger(dy)) z *= 2
        board.zoomAt(Math.pow(2, z), e.clientX - r.left, e.clientY - r.top)
      } else if (e.shiftKey && dx === 0) { c -= dy * 0.93; update() } else { c -= dx * 0.93; a -= dy * 0.93; update() }
    }, { passive: false })

    // zoom controls: Obsidian steps half a zoom level; reset = 100%; fit
    const center = (f) => { const r = t.getBoundingClientRect(); board.zoomAt(f, r.width / 2, r.height / 2) }
    const btn = (sel, fn) => { const b = t.querySelector(sel); if (b) on(b, "click", fn) }
    btn(".canvas-zoom-in", () => center(Math.SQRT2))
    btn(".canvas-zoom-out", () => center(Math.SQRT1_2))
    btn(".canvas-reset-zoom", () => center(1 / o))
    btn(".canvas-reset-view", fit)

    // Quartz's sidebar toggle shifts the board; keep the content where it was
    const page = t.closest('.page[data-frame="canvas"]'), toggle = page?.querySelector(".canvas-sidebar-toggle")
    if (page && toggle) on(toggle, "click", () => {
      const before = t.getBoundingClientRect().left
      page.classList.toggle("canvas-sidebar-open")
      requestAnimationFrame(() => { c += t.getBoundingClientRect().left - before; update() })
    })

    // for build scripts and tests
    t.__setView = board.setView
    t.__board = board

    for (const ext of exts) ext(board)
    settle()
    if (window.addCleanup) window.addCleanup(() => { for (const fn of cleanups) fn(); t.dataset.initialized = "false" })
  }

  const run = () => document.querySelectorAll(".canvas-container").forEach(init)
  document.addEventListener("nav", run)
  document.addEventListener("render", run)
})()
