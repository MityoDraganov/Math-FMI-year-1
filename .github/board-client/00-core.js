// Board (Табло.canvas) client: view state, pan/zoom gestures, controls. Replaces the canvas-page
// plugin's own script (quartz-obsidian.mjs concatenates the files in .github/board-client/ in
// name order). Behaviour follows Obsidian 1.14's canvas in read-only mode; numbers are Obsidian's
// unless noted (see the canvas source: I7.onWheel, onTouchdown, onPriorityPointerdown, requestFrame).
//
// View model as in Obsidian: (x, y) is the layer point at the centre of the container and
// zoom = log2(scale). Wheel notches, buttons and keys move targets that are eased toward each
// frame; drags, touch and trackpads move the view immediately.
//
// Features live in separate files and register with window.__obsBoardExt.push((board) => {...}).
// The board API they get:
//   board.t, board.M            container (.canvas-container) and transformed layer (.canvas-viewport)
//   board.view()                {c, a, o}: screen translation (px) and scale
//   board.setView(c, a, o)      set the view (applied on the next frame)
//   board.zoomAt(f, x, y)       multiply the scale by f around a container point (immediate)
//   board.toCanvas(x, y)        container point -> canvas (node) coordinates
//   board.viewport()            {x, y, zoom}: canvas point at the centre and log2 scale
//   board.size()                {W, H}: container size (cached, no layout read)
//   board.setViewport(x, y, z)  jump there (no easing)
//   board.zoomToBbox(b, now)    Obsidian's zoomToBbox, b = {minX, minY, maxX, maxY} in canvas coordinates
//   board.zoomToFit(now)        eased unless now
//   board.onSettle(fn)          after the view has been still for 150 ms
//   board.onFrame(fn)           every frame the view changed
//   board.onEmptyTap(fn)        a touch tap on the empty board
//   board.dragging              true while the board is being dragged (class .is-dragging)
//   board.hooks.wheel(e)        return true when the extension handled the event
//   board.hooks.pointerdown(e)  return true to keep the board from panning
//   board.hooks.touchstart(e)   return true to keep the board from panning/pinching (this gesture)
//   board.hooks.key(e)          keydown on the page while the board is shown
//   board.cleanup(fn)           run when Quartz navigates away (SPA)
;(() => {
  const exts = (window.__obsBoardExt = window.__obsBoardExt || [])
  const MIN_Z = -4, MAX_Z = 1 // Obsidian: zoom level 2^-4 … 2^1
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform)

  function init(t) {
    if (t.dataset.initialized === "true") return
    t.dataset.initialized = "true"
    const M = t.querySelector(".canvas-viewport")
    if (!M) return
    const ox = parseFloat(M.dataset.ox) || 0, oy = parseFloat(M.dataset.oy) || 0
    const cleanups = [], settleFns = [], frameFns = [], tapFns = []
    const hooks = { wheel: [], pointerdown: [], touchstart: [], key: [] }
    const on = (el, ev, fn, opt) => { el.addEventListener(ev, fn, opt); cleanups.push(() => el.removeEventListener(ev, fn, opt)) }
    const clampZ = (z) => Math.max(MIN_Z, Math.min(MAX_Z, z))

    // container size, kept by a ResizeObserver so frames never read layout
    let W = t.clientWidth, H = t.clientHeight
    // current and target view (layer coordinates, log2 zoom); zc = zoom anchor relative to the centre
    let x = 0, y = 0, z = 0, tx = 0, ty = 0, tz = 0, zc = null
    let finish = false, pauseUntil = 0, wasAnimating = false, animated = false

    let raf = 0, last = 0, settleTimer = 0
    const apply = () => {
      const s = Math.pow(2, z)
      M.style.transform = `translate(${W / 2 - x * s}px, ${H / 2 - y * s}px) scale(${s})`
      for (const fn of frameFns) fn()
    }
    // Obsidian's render loop: k = 1 - 0.984^dt of the remaining distance per frame, snap below 0.01
    const frame = () => {
      raf = 0
      // performance.now(), not the rAF timestamp: that can be older than the request (negative dt)
      const now = performance.now(), dt = now - last
      last = now
      let k = finish ? 1 : 1 - Math.pow(0.984, dt)
      finish = false
      tz = clampZ(tz)
      const m = tz - z
      if (Math.abs(m) < 0.01) k = 1
      if (m !== 0 && zc) {
        const s0 = Math.pow(2, z)
        z += m * k
        const s = Math.pow(2, z)
        x -= zc.x / s - zc.x / s0
        y -= zc.y / s - zc.y / s0
        tx = x; ty = y
      } else z += m * k
      const dx = tx - x, dy = ty - y
      x += dx * k; if (dx !== 0 && Math.abs(dx) < 0.01) x = tx
      y += dy * k; if (dy !== 0 && Math.abs(dy) < 0.01) y = ty
      apply()
      if (x !== tx || y !== ty || z !== tz || Date.now() < pauseUntil) { wasAnimating = true; raf = requestAnimationFrame(frame) }
      else { animated = animated || wasAnimating; wasAnimating = false; zc = null }
      clearTimeout(settleTimer)
      settleTimer = setTimeout(settle, 150)
    }
    const request = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame) } }

    // label size and other heavy work once the view has settled (Obsidian writes --zoom-multiplier
    // when its animation settles; .mod-animating lets labels ease to their new size)
    let settledScale = 0
    const settle = () => {
      const s = Math.pow(2, z)
      if (settledScale !== s) {
        // re-rasterize the board layer once at the new scale so text is sharp
        settledScale = s
        M.style.willChange = "auto"
        requestAnimationFrame(() => requestAnimationFrame(() => (M.style.willChange = "transform")))
      }
      t.classList.toggle("mod-animating", animated)
      animated = false
      t.style.setProperty("--zoom-multiplier", String(Math.sqrt(1 / s)))
      t.classList.toggle("mod-zoomed-out", z <= -1.7)
      for (const fn of settleFns) fn()
    }

    // immediate changes (Obsidian's panBy / setViewport): current = target
    const jump = () => { tx = x; ty = y; tz = z; zc = null; finish = true; request() }
    const panBy = (sx, sy) => { const s = Math.pow(2, z); x -= sx / s; y -= sy / s; jump() } // screen px
    const zoomAt = (f, px, py) => {
      const s0 = Math.pow(2, z)
      z = clampZ(Math.log2(s0 * f))
      const s = Math.pow(2, z), gx = px - W / 2, gy = py - H / 2
      x += gx / s0 - gx / s; y += gy / s0 - gy / s
      jump()
    }
    // eased zoom by dz levels about a container point (null = centre), as Obsidian's zoomBy
    const zoomBy = (dz, px, py) => {
      tz = clampZ(tz + dz)
      zc = px == null ? { x: 0, y: 0 } : { x: px - W / 2, y: py - H / 2 }
      request()
    }
    // Obsidian's zoomToBbox: 10% margin, fit the tighter axis, never above 100%
    const zoomToBbox = (b, now) => {
      if (!W || !H) return
      const s = Math.min(W / (1.1 * (b.maxX - b.minX)), H / (1.1 * (b.maxY - b.minY)), 1)
      tx = (b.minX + b.maxX) / 2 + ox; ty = (b.minY + b.maxY) / 2 + oy
      tz = Math.log2(s); zc = null
      if (now) finish = true
      request()
    }
    // all nodes: the layer is the nodes' bounding box plus 50 px on each side (canvas-page plugin)
    const fitBox = () => {
      const w = parseFloat(M.style.width) || 1000, h = parseFloat(M.style.height) || 1000
      return { minX: 50 - ox, minY: 50 - oy, maxX: w - 50 - ox, maxY: h - 50 - oy }
    }
    const zoomToFit = (now) => zoomToBbox(fitBox(), now)

    const board = {
      t, M,
      get dragging() { return dragging },
      view: () => { const s = Math.pow(2, z); return { c: W / 2 - x * s, a: H / 2 - y * s, o: s } },
      setView: (c, a, o) => { z = Math.log2(o); x = (W / 2 - c) / o; y = (H / 2 - a) / o; jump() },
      zoomAt,
      zoomBy,
      panBy,
      toCanvas: (px, py) => { const s = Math.pow(2, z); return { x: x + (px - W / 2) / s - ox, y: y + (py - H / 2) / s - oy } },
      viewport: () => ({ x: x - ox, y: y - oy, zoom: z }),
      size: () => ({ W, H }),
      setViewport: (nx, ny, nz) => { fitQueued = false; x = nx + ox; y = ny + oy; z = clampZ(nz); jump() },
      zoomToBbox,
      zoomToFit,
      onSettle: (fn) => settleFns.push(fn),
      onFrame: (fn) => frameFns.push(fn),
      onEmptyTap: (fn) => tapFns.push(fn),
      hooks: Object.fromEntries(Object.keys(hooks).map((k) => [k, (fn) => hooks[k].push(fn)])),
      cleanup: (fn) => cleanups.push(fn),
      clamp: (o) => Math.pow(2, clampZ(Math.log2(o))),
    }
    const handled = (list, e) => list.some((fn) => fn(e))

    // opens fitted without animation; a 0-size container fits on its first real size (zoomToFitQueued)
    let fitQueued = !W
    if (W) zoomToFit(true)
    M.style.willChange = "transform"
    const ro = new ResizeObserver(() => {
      W = t.clientWidth; H = t.clientHeight
      if (fitQueued && W) { fitQueued = false; zoomToFit(true) }
      apply() // (x, y) is the centre, so it stays put
    })
    ro.observe(t)
    cleanups.push(() => ro.disconnect())

    // dragging state: .is-dragging hides the selection toolbar; .is-grabbing sets the cursor, for
    // mouse drags only (cursor is inherited: changing it restyles every live box, a dropped frame
    // at the start of each touch pan on a phone)
    let dragging = false
    const setDragging = (v, mouse) => {
      if (dragging === v) return
      dragging = v
      t.classList.toggle("is-dragging", v)
      if (mouse || !v) t.classList.toggle("is-grabbing", v)
    }
    const rect = () => t.getBoundingClientRect()

    // Obsidian's Um(): does an ancestor of the target (up to the board) overflow and scroll?
    // Then the content gets the wheel/touch natively. hz: horizontal too (touch).
    const scrollable = (target, hz) => {
      for (let el = target; el && el !== t; el = el.parentNode) {
        if (!(el instanceof Element)) continue
        if (el.scrollHeight > el.clientHeight || (hz && el.scrollWidth > el.clientWidth)) {
          const cs = getComputedStyle(el)
          if (cs.overflowY === "auto" || cs.overflowY === "scroll") return true
          if (hz && (cs.overflowX === "auto" || cs.overflowX === "scroll")) return true
        }
      }
      return false
    }
    board.scrollable = scrollable

    // mouse drag helper: calls move(e) after `threshold` px, then end(moved)
    const dragMouse = (e, threshold, move, end) => {
      const sx = e.clientX, sy = e.clientY, id = e.pointerId
      let moved = false
      const mv = (ev) => {
        if (ev.pointerId !== id) return
        if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < threshold) return
        moved = true
        move(ev)
      }
      const up = (ev) => {
        if (ev.pointerId !== id) return
        window.removeEventListener("pointermove", mv)
        window.removeEventListener("pointerup", up)
        window.removeEventListener("pointercancel", up)
        end(moved)
      }
      window.addEventListener("pointermove", mv)
      window.addEventListener("pointerup", up)
      window.addEventListener("pointercancel", up)
    }
    const panDrag = (e, threshold, after) => {
      let px = e.clientX, py = e.clientY
      if (!threshold) setDragging(true, true)
      dragMouse(e, threshold, (ev) => {
        setDragging(true, true)
        panBy(ev.clientX - px, ev.clientY - py)
        px = ev.clientX; py = ev.clientY
      }, (moved) => { setDragging(false); after && after(moved) })
    }

    // Space held: a full-size .canvas-mover on top; left drag on it pans, wheel zooms
    let space = false, mover = null
    const editable = (el) => el instanceof Element && !!el.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']")
    on(window, "keydown", (e) => {
      if (editable(e.target) || !t.isConnected) return
      if (e.code === "Space") {
        e.preventDefault()
        if (!space) {
          space = true
          mover = document.createElement("div")
          mover.className = "canvas-mover"
          t.append(mover)
        }
        return
      }
      if (e.repeat || e.defaultPrevented) return
      if (e.shiftKey && e.code === "Digit1" && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); zoomToFit() }
      handled(hooks.key, e)
    })
    const spaceUp = () => { space = false; mover?.remove(); mover = null }
    on(window, "keyup", (e) => { if (e.code === "Space") spaceUp() })
    on(window, "blur", spaceUp)

    // mouse buttons (Obsidian's onPriorityPointerdown, capture phase)
    on(t, "pointerdown", (e) => {
      if (e.pointerType !== "mouse" && e.pointerType !== "pen") return
      if (e.button === 1 && !(isMac && e.ctrlKey)) { e.preventDefault(); e.stopPropagation(); panDrag(e, 0); return }
      if (e.button === 2 || (isMac && e.button === 1 && e.ctrlKey)) {
        e.preventDefault()
        // a pan swallows the context menu that follows (Obsidian: og(wrapperEl, "contextmenu"))
        panDrag(e, 5, (moved) => { if (moved) on(window, "contextmenu", (ev) => { ev.preventDefault(); ev.stopPropagation() }, { capture: true, once: true }) })
        return
      }
      if (e.button === 0 && space) { e.preventDefault(); e.stopPropagation(); panDrag(e, 0) }
    }, { capture: true })

    // Obsidian has no browser menu on the board (and on macOS it would open on the right-button
    // press and block the right-drag pan); links and focused content keep it (open in new tab, copy)
    on(t, "contextmenu", (e) => {
      const el = e.target instanceof Element ? e.target : null
      if (dragging || !el?.closest("a[href], .canvas-node.is-focused > .canvas-node-content")) e.preventDefault()
    })

    // touch (Obsidian's onTouchdown): one finger pans, two pinch; the finger left after a pinch
    // keeps panning. Not when the touch starts on scrollable content (native scroll).
    let gesture = null
    on(t, "pointerdown", (e) => {
      if (e.pointerType !== "touch") return
      if (gesture) { // another finger
        if (!e.isPrimary && !gesture.blocked) gesture.pts.push(pt(e))
        return
      }
      if (!e.isPrimary || e.defaultPrevented || scrollable(e.target, true)) return
      if (handled(hooks.pointerdown, e)) return
      // no preventDefault (Obsidian has one): in WebKit it cancels the tap's click; touch-action: none
      // already keeps the browser's own gestures off the board
      const r = rect()
      gesture = { id: e.pointerId, sx: e.clientX, sy: e.clientY, r, moved: false, blocked: false, empty: e.target === t, pts: [] }
      gesture.pts.push(pt(e))
      window.addEventListener("pointermove", tMove)
      window.addEventListener("pointerup", tUp)
      window.addEventListener("pointercancel", tUp)
    })
    // a finger: its id and the layer point under it
    const pt = (e) => {
      const r = gesture ? gesture.r : rect(), s = Math.pow(2, z)
      return { id: e.pointerId, px: e.clientX - r.left, py: e.clientY - r.top, wx: x + (e.clientX - r.left - W / 2) / s, wy: y + (e.clientY - r.top - H / 2) / s }
    }
    const tMove = (e) => {
      const g = gesture
      const p = g && g.pts.find((q) => q.id === e.pointerId)
      if (!p || g.blocked) return
      p.px = e.clientX - g.r.left; p.py = e.clientY - g.r.top
      if (!g.moved && e.pointerId === g.id && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) > 5) { g.moved = true; setDragging(true) }
      if (g.pts.length === 1) {
        // the layer point under the finger follows it
        const s = Math.pow(2, z)
        x = p.wx - (p.px - W / 2) / s; y = p.wy - (p.py - H / 2) / s
      } else {
        // the layer midpoint at the start stays under the fingers' midpoint; scale follows their distance
        const [a, b] = g.pts
        const s0 = Math.pow(2, z)
        const ax = x + (a.px - W / 2) / s0, ay = y + (a.py - H / 2) / s0, bx = x + (b.px - W / 2) / s0, by = y + (b.py - H / 2) / s0
        const d0 = Math.hypot(a.wx - b.wx, a.wy - b.wy), d1 = Math.hypot(ax - bx, ay - by)
        if (d0 > 0 && d1 > 0) { z = clampZ(Math.log2((s0 * d1) / d0)); pauseUntil = Date.now() + 200 }
        const s = Math.pow(2, z)
        x = (a.wx + b.wx) / 2 - ((a.px + b.px) / 2 - W / 2) / s
        y = (a.wy + b.wy) / 2 - ((a.py + b.py) / 2 - H / 2) / s
        for (const q of g.pts) { q.wx = x + (q.px - W / 2) / s; q.wy = y + (q.py - H / 2) / s }
      }
      jump()
    }
    const tUp = (e) => {
      const g = gesture
      if (!g) return
      if (e.pointerId === g.id && !g.moved && !g.blocked) { if (g.empty && e.type === "pointerup") for (const fn of tapFns) fn(e); tEnd(); return }
      const i = g.pts.findIndex((q) => q.id === e.pointerId)
      if (i < 0) return
      g.pts.splice(i, 1)
      // the remaining finger continues from where it is now
      const s = Math.pow(2, z)
      for (const q of g.pts) { q.wx = x + (q.px - W / 2) / s; q.wy = y + (q.py - H / 2) / s }
      if (!g.pts.length) tEnd()
    }
    const tEnd = () => {
      gesture = null
      setDragging(false)
      window.removeEventListener("pointermove", tMove)
      window.removeEventListener("pointerup", tUp)
      window.removeEventListener("pointercancel", tUp)
    }
    cleanups.push(tEnd)
    // extensions may claim a touch (e.g. pinch inside a focused PDF); two fingers on the board
    // must not zoom the page (iOS)
    on(t, "touchstart", (e) => {
      if (handled(hooks.touchstart, e)) { if (gesture) { gesture.blocked = true; setDragging(false) } return }
      if (gesture && e.touches.length > 1) e.preventDefault()
    }, { passive: false })
    on(t, "touchmove", (e) => { if (gesture && !gesture.blocked && e.cancelable) e.preventDefault() }, { passive: false })

    // Safari's trackpad pinch (and iOS pinch, which the pointer code above handles): gesture events.
    // Zoom in about the pointer, out about the centre, immediately (as Ctrl+wheel).
    let gScale = 0
    on(t, "gesturestart", (e) => { e.preventDefault(); gScale = gesture ? 0 : 1 }, { passive: false })
    on(t, "gesturechange", (e) => {
      e.preventDefault()
      if (!gScale || gesture) return
      const f = e.scale / gScale, r = rect()
      gScale = e.scale
      if (f > 1) zoomAt(f, e.clientX - r.left, e.clientY - r.top)
      else zoomAt(f, W / 2, H / 2)
      pauseUntil = Date.now() + 200
    }, { passive: false })
    on(t, "gestureend", (e) => { e.preventDefault(); gScale = 0 }, { passive: false })

    // Obsidian's onWheel: scrolling pans (x0.93); Ctrl/Cmd/Space + wheel and trackpad pinch zoom by
    // 2^(-dy/300); scrollable content under the pointer keeps the plain wheel.
    on(t, "wheel", (e) => {
      if (dragging || e.defaultPrevented) return
      if (handled(hooks.wheel, e)) return
      const mod = e.ctrlKey || e.metaKey
      const r = rect()
      if (isMac && e.ctrlKey && e.deltaX === 0 && e.deltaY === 0) { e.preventDefault(); smartZoom(e.clientX - r.left, e.clientY - r.top); return }
      if (!mod && scrollable(e.target, false)) return
      if (gScale) { e.preventDefault(); return } // Safari: the gesture events zoom
      e.preventDefault()
      let dx = e.deltaX, dy = e.deltaY
      if (e.deltaMode === 1) { dx *= 40; dy *= 40 } else if (e.deltaMode === 2) { dx *= 800; dy *= 800 }
      const s = Math.pow(2, z)
      if (mod || space) {
        let c = -dy / 300
        if (isMac && !Number.isInteger(dy)) c *= 2
        // zooming in keeps the point under the pointer, zooming out keeps the centre
        if (dy < 0) zoomBy(c, e.clientX - r.left, e.clientY - r.top)
        else zoomBy(c)
        pauseUntil = Date.now() + 200
      } else if (e.shiftKey && dx === 0) tx += (dy / s) * 0.93
      else { tx += (dx / s) * 0.93; ty += (dy / s) * 0.93 }
      // only classic mouse-wheel notches (wheelDelta ±120) ease; trackpads and precise wheels jump
      const wy = e.wheelDeltaY, wx = e.wheelDeltaX
      const notch = (dx === 0 && Number.isInteger(wy) && Math.abs(wy) === 120 && wy !== -3 * dy) ||
        (dy === 0 && Number.isInteger(wx) && Math.abs(wx) === 120 && wx !== -3 * dx)
      if (!notch) finish = true
      request()
    }, { passive: false })

    // macOS smart zoom (two-finger double tap): the selection under the pointer, else the smallest
    // node under it, else everything
    const smartZoom = (px, py) => {
      const p = board.toCanvas(px, py), inside = (b) => p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY
      const sel = board.selectionBox?.()
      if (sel && inside(sel)) return zoomToBbox(sel)
      let best = null
      for (const n of t.querySelectorAll(".canvas-node")) {
        const b = nodeBox(n)
        if (inside(b) && (!best || (b.maxX - b.minX) * (b.maxY - b.minY) < (best.maxX - best.minX) * (best.maxY - best.minY))) best = b
      }
      zoomToBbox(best || fitBox())
    }
    // a node's box in canvas coordinates (its left/top/width/height)
    const nodeBox = (n) => {
      const l = parseFloat(n.style.left), tp = parseFloat(n.style.top)
      return { minX: l, minY: tp, maxX: l + parseFloat(n.style.width), maxY: tp + parseFloat(n.style.height) }
    }
    board.nodeBox = nodeBox

    // zoom controls: Obsidian's zoomBy(±0.5) about the centre, reset = zoom 0, fit = Shift+1 (eased)
    const btn = (sel, fn) => { const b = t.querySelector(sel); if (b) on(b, "click", fn) }
    btn(".canvas-zoom-in", () => zoomBy(0.5))
    btn(".canvas-zoom-out", () => zoomBy(-0.5))
    btn(".canvas-reset-zoom", () => zoomBy(-tz))
    btn(".canvas-reset-view", () => zoomToFit())

    // Quartz's sidebar toggle shifts the board; keep the content where it was
    const page = t.closest('.page[data-frame="canvas"]'), toggle = page?.querySelector(".canvas-sidebar-toggle")
    if (page && toggle) on(toggle, "click", () => {
      const before = rect().left
      page.classList.toggle("canvas-sidebar-open")
      requestAnimationFrame(() => panBy(rect().left - before, 0))
    })

    // for build scripts and tests
    t.__setView = board.setView
    t.__board = board

    for (const ext of exts) ext(board)
    apply()
    settle()
    if (window.addCleanup) window.addCleanup(() => {
      cancelAnimationFrame(raf); clearTimeout(settleTimer)
      for (const fn of cleanups) fn()
      t.dataset.initialized = "false"
    })
  }

  const run = () => document.querySelectorAll(".canvas-container").forEach(init)
  document.addEventListener("nav", run)
  document.addEventListener("render", run)
})()
