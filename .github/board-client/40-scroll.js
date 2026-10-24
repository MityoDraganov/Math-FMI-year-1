// Scrolling inside a box, as Obsidian's .markdown-preview-view (overflow-y: auto): the focused box
// shows live content right away and scrolls; the wheel/touch rule (Obsidian's Um) is in 00-core.js.
// .obs-scroll marks a focused box whose content overflows: only there touch-action lets the browser
// scroll natively (elsewhere the board keeps every touch). A box that was scrolled stays live after
// it loses focus, so it keeps showing the scrolled content (Obsidian keeps scroll positions).
;(window.__obsBoardExt = window.__obsBoardExt || []).push((board) => {
  const { t } = board
  let cur = null
  t.addEventListener("obs-focus", (e) => {
    const n = e.detail.node
    if (cur) {
      cur.classList.remove("obs-scroll")
      if (!cur.scrollTop && board.releaseLive) board.releaseLive(cur)
      cur = null
    }
    const el = n && n.querySelector(":scope > .canvas-node-content:not(.pdf-embed)")
    if (!el) return
    cur = el
    if (board.makeLive) board.makeLive(el)
    // after the live content has laid out
    requestAnimationFrame(() => { if (cur === el) el.classList.toggle("obs-scroll", el.scrollHeight > el.clientHeight) })
  })
})
