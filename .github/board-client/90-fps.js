// ?fps in the URL: frames per second, slowest frame, zoom and live boxes, for testing on devices.
;(window.__obsBoardExt = window.__obsBoardExt || []).push((board) => {
  if (!/[?&]fps\b/.test(location.search)) return
  const m = document.createElement("div")
  m.className = "obs-fps"
  m.style.cssText = "position:fixed;left:8px;bottom:8px;z-index:99;padding:4px 8px;border-radius:6px;background:rgba(0,0,0,.75);color:#0f0;font:12px ui-monospace,monospace;pointer-events:none"
  document.body.append(m)
  let last = performance.now(), n = 0, worst = 0, t0 = last, on = true
  const tick = (now) => {
    if (!on) return
    const d = now - last
    last = now
    n++
    worst = Math.max(worst, d)
    if (now - t0 > 1000) {
      const live = (board.pictures || []).filter((b) => b.live).length
      m.textContent = `${Math.round((n * 1000) / (now - t0))} fps · worst ${Math.round(worst)} ms · zoom ${board.view().o.toFixed(2)} · live ${live}/${(board.pictures || []).length} · dpr ${window.devicePixelRatio}`
      n = 0
      worst = 0
      t0 = now
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  board.cleanup(() => { on = false; m.remove() })
})
