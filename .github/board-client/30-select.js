// Selection and focus, as Obsidian's read-only canvas: a click selects one box (.is-focused: its
// content takes pointer events, links and text selection; see 30-select.scss), Shift toggles,
// several selected boxes are .is-selected with a group box around them, the empty board deselects
// on pointerdown and left-drag draws a selection rectangle. Escape deselects, Shift+2 zooms to the
// selection, and a toolbar above the selection has Obsidian's read-only button "Zoom to selection".
// API: board.focus(nodeEl|null), board.focused, board.selected (Set), board.selectionBox().
// Event on the container: "obs-focus" {detail: {node}} when the single focused node changes.
;(window.__obsBoardExt = window.__obsBoardExt || []).push((board) => {
  const { t, M } = board
  const layer = t.querySelector(".canvas-nodes:not(.canvas-groups)") || M
  const nodeOf = (el) => (el instanceof Element ? el.closest(".canvas-node") : null)
  const isGroup = (n) => n.classList.contains("canvas-node-group")

  let sel = new Set(), focused = null, zTop = 1
  const select = (next) => {
    const prev = sel
    sel = next
    const f = sel.size === 1 ? [...sel][0] : null
    for (const n of new Set([...prev, ...sel])) {
      n.classList.toggle("is-focused", n === f)
      n.classList.toggle("is-selected", sel.size > 1 && sel.has(n))
    }
    if (f !== focused) {
      // Obsidian raises a focused node above the others (zIndexCounter + 1)
      if (f && !isGroup(f)) f.style.zIndex = String(++zTop)
      focused = f
      t.dispatchEvent(new CustomEvent("obs-focus", { detail: { node: f } }))
    }
    groupBox()
    menu(true)
  }
  const selectOnly = (n) => select(new Set(n ? [n] : []))
  const toggle = (n) => { const s = new Set(sel); s.has(n) ? s.delete(n) : s.add(n); select(s) }
  board.focus = selectOnly
  Object.defineProperty(board, "focused", { get: () => focused })
  Object.defineProperty(board, "selected", { get: () => sel })

  const bbox = (nodes) => {
    let b = null
    for (const n of nodes) {
      const r = board.nodeBox(n)
      b = b ? { minX: Math.min(b.minX, r.minX), minY: Math.min(b.minY, r.minY), maxX: Math.max(b.maxX, r.maxX), maxY: Math.max(b.maxY, r.maxY) } : r
    }
    return b
  }
  board.selectionBox = () => (sel.size ? bbox(sel) : null)
  const zoomToSelection = () => { const b = board.selectionBox(); if (b) board.zoomToBbox(b) }

  // a rectangle in node coordinates (Obsidian's .canvas-selection; the multi-select one is mod-group-selection)
  const rectEl = (cls) => {
    const el = document.createElement("div")
    el.className = cls
    el.hidden = true
    layer.append(el)
    return el
  }
  const place = (el, b) => {
    el.hidden = !b
    if (b) el.style.cssText = `left:${b.minX}px;top:${b.minY}px;width:${b.maxX - b.minX}px;height:${b.maxY - b.minY}px`
  }
  const groupEl = rectEl("canvas-selection mod-group-selection")
  const groupBox = () => place(groupEl, sel.size > 1 ? bbox(sel) : null)

  // clicks: on a node (or a group's label) select it; Shift toggles. The file name above a box is
  // not a link: click selects, double-click opens the note here, Mod+click in a new tab.
  let swallowClick = false
  board.cleanup(() => { swallowClick = false })
  const mod = (e) => (/Mac|iPhone|iPad/.test(navigator.platform) ? e.metaKey : e.ctrlKey)
  t.addEventListener("click", (e) => {
    if (swallowClick) { swallowClick = false; e.preventDefault(); e.stopPropagation(); return }
    const label = e.target instanceof Element && e.target.closest(".canvas-file-label a")
    const n = nodeOf(e.target)
    if (label) {
      e.preventDefault()
      e.stopPropagation() // keep Quartz's router from following it
      if (mod(e)) { window.open(label.href, "_blank"); return }
    }
    if (!n || !t.contains(n) || e.target.closest(".canvas-controls")) return
    if (e.shiftKey) toggle(n)
    else if (!(sel.size === 1 && sel.has(n))) selectOnly(n)
  })
  t.addEventListener("dblclick", (e) => {
    const label = e.target instanceof Element && e.target.closest(".canvas-file-label a")
    if (!label) return
    e.preventDefault()
    e.stopPropagation()
    const url = new URL(label.href, location.href)
    if (window.spaNavigate) window.spaNavigate(url)
    else location.href = url.href
  })
  // no page preview on the file name (Obsidian shows none there); content links preview only in the
  // focused box, where the content takes pointer events at all
  const noPreview = (e) => { if (e.target instanceof Element && e.target.closest(".canvas-file-label")) e.stopPropagation() }
  t.addEventListener("mouseenter", noPreview, true)
  t.addEventListener("mouseover", noPreview, true)

  // empty board: deselect on pointerdown (unless Shift), then drag = selection rectangle
  const band = rectEl("canvas-selection")
  t.addEventListener("pointerdown", (e) => {
    if (e.target !== t || e.pointerType !== "mouse" || e.button !== 0) return
    const shift = e.shiftKey, before = new Set(sel)
    if (!shift) select(new Set())
    const r = t.getBoundingClientRect(), p0 = board.toCanvas(e.clientX - r.left, e.clientY - r.top)
    const id = e.pointerId, sx = e.clientX, sy = e.clientY
    let started = false, last = null, timer = 0, ex = 0, ey = 0
    const update = () => {
      const p = board.toCanvas(last.clientX - r.left, last.clientY - r.top)
      const b = { minX: Math.min(p0.x, p.x), minY: Math.min(p0.y, p.y), maxX: Math.max(p0.x, p.x), maxY: Math.max(p0.y, p.y) }
      place(band, b)
      // nodes that intersect it; groups only when fully inside
      const hit = new Set()
      for (const n of t.querySelectorAll(".canvas-node")) {
        const nb = board.nodeBox(n)
        const ok = isGroup(n)
          ? nb.minX >= b.minX && nb.maxX <= b.maxX && nb.minY >= b.minY && nb.maxY <= b.maxY
          : nb.minX < b.maxX && nb.maxX > b.minX && nb.minY < b.maxY && nb.maxY > b.minY
        if (ok) hit.add(n)
      }
      if (shift) for (const n of before) hit.has(n) ? hit.delete(n) : hit.add(n)
      if (hit.size !== sel.size || [...hit].some((n) => !sel.has(n))) select(hit)
    }
    const move = (ev) => {
      if (ev.pointerId !== id) return
      if (!started && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return
      if (!started) { started = true; t.classList.add("is-dragging", "is-grabbing") }
      last = ev
      // near the edge (30 px inset) the board pans: clamp(dist, -40, 40) * 0.5/sqrt(scale) per 1/60 s
      const dx = ev.clientX < r.left + 30 ? ev.clientX - r.left - 30 : ev.clientX > r.right - 30 ? ev.clientX - r.right + 30 : 0
      const dy = ev.clientY < r.top + 30 ? ev.clientY - r.top - 30 : ev.clientY > r.bottom - 30 ? ev.clientY - r.bottom + 30 : 0
      ex = Math.max(-40, Math.min(40, dx)); ey = Math.max(-40, Math.min(40, dy))
      if ((ex || ey) && !timer) timer = setInterval(() => {
        const s = board.view().o, k = (0.5 / Math.sqrt(s)) * s // canvas units -> screen px
        board.panBy(-ex * k, -ey * k)
      }, 1000 / 60)
      else if (!ex && !ey && timer) { clearInterval(timer); timer = 0 }
      update()
    }
    const up = (ev) => {
      if (ev.pointerId !== id) return
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      window.removeEventListener("pointercancel", up)
      clearInterval(timer)
      place(band, null)
      t.classList.remove("is-dragging", "is-grabbing")
      if (started) swallowClick = true // the click after the drag
      setTimeout(() => (swallowClick = false), 0)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    window.addEventListener("pointercancel", up)
  })
  board.onEmptyTap(() => select(new Set()))

  board.hooks.key((e) => {
    if (e.key === "Escape") { select(new Set()); return true }
    if (e.shiftKey && e.code === "Digit2" && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); zoomToSelection(); return true }
  })

  // the selection toolbar: in read-only mode only "Zoom to selection"; hidden while dragging
  const box = document.createElement("div")
  box.className = "canvas-menu-container"
  box.innerHTML = '<div class="canvas-menu"><button class="clickable-icon" aria-label="Zoom to selection\n(⇧ 2)" data-tooltip-position="top"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon zoom-to-selection"><path d="M2 6V4a2 2 0 0 1 2-2h2m12 0h2a2 2 0 0 1 2 2v2m0 12v2a2 2 0 0 1-2 2h-2M6 22H4a2 2 0 0 1-2-2v-2m9-2a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm7 2-3-3"></path></svg></button></div>'
  box.hidden = true
  t.append(box)
  box.querySelector("button").addEventListener("click", (e) => { e.stopPropagation(); zoomToSelection() })
  let mw = 0, mh = 0
  const menu = (changed) => {
    const show = sel.size > 0 // (hidden while dragging by CSS: .is-dragging)
    box.hidden = !show
    if (!show) return
    if (changed || !mw) { const r = box.firstChild.getBoundingClientRect(); mw = r.width; mh = r.height }
    const b = bbox(sel), { c, a, o } = board.view()
    // bottom edge 10/scale above the selection; 30/sqrt(scale) for a file node (its name is there),
    // 35/sqrt(scale) when a group is selected; centred, and kept 10 px inside the board
    const last = [...sel].pop()
    let top = b.minY - 10 / o
    if ([...sel].some(isGroup)) top = b.minY - 35 / Math.sqrt(o)
    else if (last.classList.contains("canvas-node-file")) top = b.minY - 30 / Math.sqrt(o)
    const { W, H } = board.size()
    const ox = parseFloat(M.dataset.ox) || 0, oy = parseFloat(M.dataset.oy) || 0
    let l = ((b.minX + b.maxX) / 2 + ox) * o + c - mw / 2
    let tp = (top + oy) * o + a - mh
    l = Math.max(10, Math.min(W - mw - 10, l))
    tp = Math.max(10, Math.min(H - mh - 10, tp))
    box.style.transform = `translate(${l}px,${tp}px)`
  }
  board.onFrame(() => { if (sel.size) menu(false) })

  // edges: an invisible wide stroke takes the hover (Obsidian's path.canvas-interaction-path);
  // only where there is a hover, so taps on phones stay on the board
  if (matchMedia("(hover: hover)").matches) for (const p of t.querySelectorAll(".canvas-edges .canvas-display-path")) {
    const q = document.createElementNS("http://www.w3.org/2000/svg", "path")
    q.setAttribute("class", "canvas-interaction-path")
    q.setAttribute("d", p.getAttribute("d"))
    p.before(q)
  }
})
