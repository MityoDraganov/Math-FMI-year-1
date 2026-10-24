// Dot grid as its own layer: while panning it only moves (no repaint). Obsidian's grid: dots of
// radius 0.7px every 20/40/80/160 canvas units depending on the zoom level.
;(window.__obsBoardExt = window.__obsBoardExt || []).push((board) => {
  const { t, M } = board
  const D = document.createElement("div")
  D.className = "obs-dots"
  t.prepend(D)
  const ox = parseFloat(M.dataset.ox) || 0, oy = parseFloat(M.dataset.oy) || 0
  let size = 0
  board.onFrame(() => {
    const { c, a, o } = board.view(), z = Math.log2(o)
    const G = (z < -3.3 ? 160 : z < -2.16 ? 80 : z < -0.91 ? 40 : 20) * o
    if (G !== size) { size = G; D.style.backgroundSize = `${G}px ${G}px` }
    D.style.transform = `translate3d(${(((c + ox * o) % G) + G) % G - G}px,${(((a + oy * o) % G) + G) % G - G}px,0)`
  })
})
