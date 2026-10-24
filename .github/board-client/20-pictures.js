// Boxes show pictures made at build time (board-snapshots.mjs) and switch to live content only
// when visible at a zoom where the picture would look soft, one box per frame after the view
// settles. Other features can force a box live with board.makeLive(contentEl).
;(window.__obsBoardExt = window.__obsBoardExt || []).push((board) => {
  const { t, M } = board
  const base = t.dataset.snap, ver = t.dataset.snapV
  const ox = parseFloat(M.dataset.ox) || 0, oy = parseFloat(M.dataset.oy) || 0
  const boxes = base ? [...t.querySelectorAll(".canvas-node-content[data-snapped]")].map((el) => {
    const n = el.closest(".canvas-node"), img = document.createElement("img")
    img.className = "obs-snap"
    img.alt = ""
    img.decoding = "async"
    img.draggable = false
    img.onerror = () => el.classList.add("is-live")
    el.prepend(img)
    return { el, img, id: n.dataset.nodeId, x: parseFloat(n.style.left), y: parseFloat(n.style.top), w: parseFloat(n.style.width), h: parseFloat(n.style.height), live: false, forced: false }
  }) : []
  board.pictures = boxes

  let queue = [], frame = 0
  const work = () => {
    frame = 0
    const b = queue.shift()
    if (b) { b.el.classList.toggle("is-live", b.live); if (queue.length) frame = requestAnimationFrame(work) }
  }
  const tiers = () => {
    const { c, a, o } = board.view(), r = t.getBoundingClientRect()
    const need = o * (window.devicePixelRatio || 1)
    const theme = document.documentElement.getAttribute("saved-theme") === "light" ? "light" : "dark"
    const mx = r.width / o / 2, my = r.height / o / 2 // half a screen around the visible area
    const x0 = -c / o - ox - mx, y0 = -a / o - oy - my, x1 = x0 + r.width / o + 2 * mx, y1 = y0 + r.height / o + 2 * my
    queue = []
    for (const b of boxes) {
      const vis = b.x < x1 && b.x + b.w > x0 && b.y < y1 && b.y + b.h > y0
      const live = b.forced || (vis && need > 1.5)
      const src = `${base}${b.id}-${theme}-${vis && need > 0.6 ? "m" : "l"}.jpg?v=${ver}`
      if (b.img.getAttribute("src") !== src) b.img.src = src
      if (b.live !== live) { b.live = live; queue.push(b) }
    }
    cancelAnimationFrame(frame)
    if (queue.length) frame = requestAnimationFrame(work)
  }
  // switch one box to live content right away (e.g. the user wants to scroll or select in it)
  board.makeLive = (el) => {
    const b = boxes.find((x) => x.el === el)
    if (!b) return
    b.forced = true
    if (!b.live) { b.live = true; el.classList.add("is-live") }
  }
  board.releaseLive = (el) => {
    const b = boxes.find((x) => x.el === el)
    if (b) b.forced = false
  }
  board.onSettle(tiers)
  const onTheme = () => tiers()
  document.addEventListener("themechange", onTheme)
  board.cleanup(() => document.removeEventListener("themechange", onTheme))
})
