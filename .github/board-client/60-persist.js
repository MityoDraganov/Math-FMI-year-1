// Keep the reader's place: Obsidian reopens a canvas at its last viewport (workspace state). The
// view (centre point and zoom, so it does not depend on the screen size) is saved per board when it
// settles and restored on reload and on Back from a note; the first visit opens fitted.
;(window.__obsBoardExt = window.__obsBoardExt || []).push((board) => {
  const key = "obs-board-view:" + decodeURIComponent(location.pathname)
  try {
    const v = JSON.parse(localStorage.getItem(key) || "null")
    if (v && [v.x, v.y, v.zoom].every(Number.isFinite)) board.setViewport(v.x, v.y, v.zoom)
  } catch {}
  board.onSettle(() => {
    try { localStorage.setItem(key, JSON.stringify(board.viewport())) } catch {}
  })
})
