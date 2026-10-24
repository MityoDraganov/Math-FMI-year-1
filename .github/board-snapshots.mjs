// Build step (after mathjax-prerender.mjs): picture every text box of every board, so phones pan
// and zoom ~70 pictures instead of ~65 000 live elements. The page swaps a box to its live content
// once you stop on it at a zoom where the picture would look soft (see quartz-obsidian.mjs).
// Must run on macOS so the pictures use the same system font (SF) as Apple devices.
// Usage: node board-snapshots.mjs <built site dir>   (needs playwright + chromium)
import fs from "fs"
import http from "http"
import path from "path"
import { chromium } from "playwright"

const site = path.resolve(process.argv[2])
const version = Date.now().toString(36)
const TIERS = { l: 0.5, m: 1.25 } // picture scale per tier: low (overview), mid (closer)

// static server for the built site
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json", ".woff2": "font/woff2" }
const server = http.createServer((req, res) => {
  let p = path.join(site, decodeURIComponent(req.url.split("?")[0]))
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, "index.html")
  if (!fs.existsSync(p) && fs.existsSync(p + ".html")) p += ".html"
  if (!fs.existsSync(p)) return res.writeHead(404).end()
  res.writeHead(200, { "content-type": types[path.extname(p)] ?? "application/octet-stream" }).end(fs.readFileSync(p))
}).listen(0)
const base = `http://localhost:${server.address().port}`

const boards = []
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".canvas.html") && boards.push(path.join(d, e.name)) }
walk(site)

const browser = await chromium.launch()
let shots = 0
for (const file of boards) {
  const rel = path.relative(site, file)
  const name = rel.replace(/\.canvas\.html$/, "").replace(/[\\/]/g, "_")
  const outDir = path.join(site, "static", "snap", name)
  fs.mkdirSync(outDir, { recursive: true })
  let ids = []
  for (const theme of ["dark", "light"]) {
    for (const [tier, scale] of Object.entries(TIERS)) {
      const ctx = await browser.newContext({ viewport: { width: 1400, height: 1200 }, deviceScaleFactor: scale, colorScheme: theme })
      await ctx.addInitScript((t) => localStorage.setItem("theme", t), theme)
      const page = await ctx.newPage()
      await page.goto(`${base}/${rel.split(path.sep).map(encodeURIComponent).join("/")}`, { waitUntil: "networkidle" })
      await page.evaluate(() => document.fonts.ready)
      ids = await page.evaluate(() => {
        // live content everywhere, edges and labels hidden: only the box contents are pictured
        const t = document.querySelector(".canvas-container")
        t.classList.add("obs-snapshotting")
        const st = document.createElement("style") // page buttons must not end up in the pictures
        st.textContent = ".canvas-sidebar-toggle,.canvas-controls,.obs-fps{display:none!important}"
        document.head.append(st)
        return [...t.querySelectorAll(".canvas-node-file:not(.canvas-node-pdf):not(.canvas-node-image), .canvas-node-text")].map((n) => n.dataset.nodeId)
      })
      for (const id of ids) {
        for (let attempt = 1; ; attempt++) {
          try {
            const clip = await page.evaluate(async (id) => {
              const t = document.querySelector(".canvas-container"), M = t.querySelector(".canvas-viewport")
              const n = t.querySelector(`.canvas-node[data-node-id="${id}"]`)
              t.__setView(-(parseFloat(n.style.left) + +M.dataset.ox) + 20, -(parseFloat(n.style.top) + +M.dataset.oy) + 20, 1)
              await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))) // view updates on the next frame
              const r = n.querySelector(".canvas-node-content").getBoundingClientRect()
              return { x: r.x, y: r.y, width: r.width, height: r.height }
            }, id)
            await page.screenshot({ path: path.join(outDir, `${id}-${theme}-${tier}.jpg`), clip, type: "jpeg", quality: 82 })
            break
          } catch (e) {
            if (attempt === 3) throw e // occasional timing hiccup in headless Chromium: retry
          }
        }
        shots++
      }
      await ctx.close()
    }
  }
  // tell the page where the pictures are and put the low-tier picture into every pictured box
  let html = fs.readFileSync(file, "utf8")
  const snapUrl = path.relative(path.dirname(file), outDir).split(path.sep).join("/") + "/"
  html = html.replace('class="canvas-container"', `class="canvas-container" data-snap="${snapUrl}" data-snap-v="${version}"`)
  for (const id of ids) {
    const re = new RegExp(`(<div class="canvas-node [^"]*" data-node-id="${id}"[^>]*>[\\s\\S]*?<div class="canvas-node-content[^"]*")`)
    if (!re.test(html)) throw new Error(`${rel}: node ${id} not found`)
    html = html.replace(re, `$1 data-snapped`)
  }
  fs.writeFileSync(file, html)
  console.log(`${rel}: ${ids.length} boxes pictured`)
}
await browser.close()
server.close()
console.log(`${shots} pictures`)
