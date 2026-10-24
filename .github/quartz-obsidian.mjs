// Makes @quartz-community/canvas-page render boards the way Obsidian does (edge geometry, labels,
// zoom-dependent label size, dot grid, colors). Run from the Quartz root after `npm ci`.
// Every replacement must match exactly once, so a plugin update fails the build instead of
// silently producing a different board.
import fs from "fs"

const dir = "node_modules/@quartz-community/canvas-page/dist"

const edgeCode = String.raw`function obsAnchor(n, side) {
  const cx = n.x + n.width / 2, cy = n.y + n.height / 2;
  switch (side) {
    case "top": return { x: cx, y: n.y };
    case "right": return { x: n.x + n.width, y: cy };
    case "bottom": return { x: cx, y: n.y + n.height };
    default: return { x: n.x, y: cy };
  }
}
function obsMove(p, side, d) {
  switch (side) {
    case "top": return { x: p.x, y: p.y - d };
    case "bottom": return { x: p.x, y: p.y + d };
    case "left": return { x: p.x - d, y: p.y };
    default: return { x: p.x + d, y: p.y };
  }
}
function obsAutoSide(a, b) {
  const r = Math.atan2(b.y + b.height / 2 - (a.y + a.height / 2), b.x + b.width / 2 - (a.x + a.width / 2));
  const o = Math.atan2(a.height, a.width);
  return r > -o && r <= o ? "right" : r > o && r <= Math.PI - o ? "bottom" : r > Math.PI - o || r <= -(Math.PI - o) ? "left" : "top";
}
const OBS_ROT = { top: 180, bottom: 0, left: 90, right: 270 };
function obsEdgeGeom(edge, nodeMap) {
  const from = nodeMap.get(edge.fromNode), to = nodeMap.get(edge.toNode);
  if (!from || !to) return null;
  const fs = edge.fromSide ?? obsAutoSide(from, to), ts = edge.toSide ?? obsAutoSide(to, from);
  const a = obsAnchor(from, fs), s = obsMove(a, fs, 7), l = obsAnchor(to, ts), c = obsMove(l, ts, 7);
  const k = Math.min(150, Math.max(70, Math.hypot(c.x - s.x, c.y - s.y) / 2));
  const p1 = obsMove(s, fs, k), p2 = obsMove(c, ts, k);
  const fromArrow = edge.fromEnd === "arrow", toArrow = (edge.toEnd ?? "arrow") === "arrow";
  let d = "M" + s.x + "," + s.y + " C" + p1.x + "," + p1.y + " " + p2.x + "," + p2.y + " " + c.x + "," + c.y;
  if (!fromArrow) d = "M" + a.x + " " + a.y + " L" + s.x + " " + s.y + " " + d;
  if (!toArrow) d = d + " M" + c.x + " " + c.y + " L" + l.x + " " + l.y;
  const mid = { x: 0.125 * s.x + 0.375 * p1.x + 0.375 * p2.x + 0.125 * c.x, y: 0.125 * s.y + 0.375 * p1.y + 0.375 * p2.y + 0.125 * c.y };
  return { d, a, l, fs, ts, fromArrow, toArrow, mid, color: resolveColor(edge.color) };
}
function obsEnd(p, side) {
  return u2("g", { style: "transform:translate(" + p.x + "px," + p.y + "px) rotate(" + OBS_ROT[side] + "deg)", children: u2("polygon", { class: "canvas-path-end", points: "0,0 6.5,10.4 -6.5,10.4" }) });
}
function renderEdge(edge, nodeMap) {
  const g = obsEdgeGeom(edge, nodeMap);
  if (!g) return null;
  return u2("g", { class: "canvas-edge", "data-edge-id": edge.id, style: g.color ? "--canvas-color:" + g.color : void 0, children: [
    u2("path", { class: "canvas-display-path", d: g.d }),
    g.fromArrow && obsEnd(g.a, g.fs),
    g.toArrow && obsEnd(g.l, g.ts)
  ] });
}
function renderEdgeLabel(edge, nodeMap) {
  const g = edge.label && obsEdgeGeom(edge, nodeMap);
  if (!g) return null;
  return u2("div", { class: "canvas-path-label-wrapper", style: "left:" + g.mid.x + "px;top:" + g.mid.y + "px", children: u2("div", { class: "canvas-path-label", children: edge.label }) });
}
`

const OBS_PDF_TOOLBAR = "<div class=\"pdf-toolbar\"><div class=\"pdf-toolbar-left\"><div class=\"clickable-icon\" aria-label=\"Toggle sidebar\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"svg-icon lucide-layout-list\"><rect x=\"3\" y=\"3\" width=\"7\" height=\"7\" rx=\"1\"></rect><rect x=\"3\" y=\"14\" width=\"7\" height=\"7\" rx=\"1\"></rect><path d=\"M14 4h7\"></path><path d=\"M14 9h7\"></path><path d=\"M14 15h7\"></path><path d=\"M14 20h7\"></path></svg></div><div class=\"clickable-icon\" aria-label=\"Sidebar options\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"svg-icon lucide-chevron-down\"><path d=\"m6 9 6 6 6-6\"></path></svg></div><div class=\"pdf-toolbar-spacer\"></div><div class=\"clickable-icon\" aria-label=\"Zoom out\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"svg-icon lucide-zoom-out\"><circle cx=\"11\" cy=\"11\" r=\"8\"></circle><line x1=\"21\" y1=\"21\" x2=\"16.65\" y2=\"16.65\"></line><line x1=\"8\" y1=\"11\" x2=\"14\" y2=\"11\"></line></svg></div><div class=\"pdf-toolbar-divider\"></div><div class=\"clickable-icon\" aria-label=\"Zoom in\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"svg-icon lucide-zoom-in\"><circle cx=\"11\" cy=\"11\" r=\"8\"></circle><line x1=\"21\" y1=\"21\" x2=\"16.65\" y2=\"16.65\"></line><line x1=\"11\" y1=\"8\" x2=\"11\" y2=\"14\"></line><line x1=\"8\" y1=\"11\" x2=\"14\" y2=\"11\"></line></svg></div><div class=\"clickable-icon\" aria-label=\"Display options\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"svg-icon lucide-chevron-down\"><path d=\"m6 9 6 6 6-6\"></path></svg></div><div class=\"pdf-toolbar-spacer\"></div><input class=\"pdf-page-input\" type=\"number\" value=\"1\" aria-label=\"Page\"><span class=\"pdf-page-numbers\">of __PAGES__</span></div><div class=\"pdf-toolbar-right\"><div class=\"pdf-toolbar-spacer\"></div><div class=\"clickable-icon\" aria-label=\"Open\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"svg-icon lucide-more-vertical\"><circle cx=\"12\" cy=\"12\" r=\"1\"></circle><circle cx=\"12\" cy=\"5\" r=\"1\"></circle><circle cx=\"12\" cy=\"19\" r=\"1\"></circle></svg></div><div class=\"clickable-icon\" aria-label=\"Save current position in document\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"svg-icon lucide-file-symlink\"><path d=\"M4 11V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h7\"></path><path d=\"M14 2v5a1 1 0 0 0 1 1h5\"></path><path d=\"m10 18 3-3-3-3\"></path></svg></div></div></div>"

const OBS_CONTROLS = "<div class=\"canvas-control-group mod-raised\"><div class=\"canvas-control-item canvas-zoom-in\" role=\"button\" tabindex=\"0\" onkeydown=\"if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();this.click()}\" aria-label=\"Zoom in\" data-tooltip-position=\"left\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"svg-icon lucide-plus\"><path d=\"M5 12h14\"></path><path d=\"M12 5v14\"></path></svg></div><div class=\"canvas-control-item canvas-reset-zoom\" role=\"button\" tabindex=\"0\" onkeydown=\"if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();this.click()}\" aria-label=\"Reset zoom\" data-tooltip-position=\"left\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"svg-icon lucide-rotate-cw\"><path d=\"M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8\"></path><path d=\"M21 3v5h-5\"></path></svg></div><div class=\"canvas-control-item canvas-reset-view\" role=\"button\" tabindex=\"0\" onkeydown=\"if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();this.click()}\" aria-label=\"Zoom to fit\" data-tooltip-position=\"left\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"svg-icon lucide-maximize\"><path d=\"M8 3H5a2 2 0 0 0-2 2v3\"></path><path d=\"M21 8V5a2 2 0 0 0-2-2h-3\"></path><path d=\"M3 16v3a2 2 0 0 0 2 2h3\"></path><path d=\"M16 21h3a2 2 0 0 0 2-2v-3\"></path></svg></div><div class=\"canvas-control-item canvas-zoom-out\" role=\"button\" tabindex=\"0\" onkeydown=\"if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();this.click()}\" aria-label=\"Zoom out\" data-tooltip-position=\"left\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"svg-icon lucide-minus\"><path d=\"M5 12h14\"></path></svg></div></div>"

const clientDir = new URL("./board-client/", import.meta.url)
const boardClient = fs.readdirSync(clientDir).filter((f) => f.endsWith(".js")).sort()
  .map((f) => fs.readFileSync(new URL(f, clientDir), "utf8")).join("\n")

const patches = [
  // PDF boxes, as Obsidian's .pdf-embed: its toolbar over pdf.js's page list. Page 1 is rendered
  // by obsidian-compat.py, the other pages by board-pdf-pages.py; board-client/50-pdf.js scrolls,
  // zooms and loads them once the box is focused.
  ["      const embedded = resolveEmbeddedHtml(fileSlug, slug2, allFiles, node.subpath, visited);",
    `      if (node.pdfPage1) {
        const href = resolveRelative(slug2, fileSlug);
        const img = resolveRelative(slug2, slugifyFilePath(node.pdfPage1));
        const pages = node.pdfPagesDir ? resolveRelative(slug2, slugifyFilePath(node.pdfPagesDir + "/m-002.png")) : "";
        return u2("div", { class: "canvas-node canvas-node-file canvas-node-pdf", "data-node-id": node.id, "data-pdf-pages": pages, "data-pdf-sizes": (node.pdfSizes || []).join(","), "data-pdf-labels": node.pdfPageLabels ? JSON.stringify(node.pdfPageLabels) : void 0, style: styleStr, children: [
          u2("div", { class: "canvas-file-label", children: u2("a", { href, class: "canvas-file-link", children: filename }) }),
          u2("div", { class: "canvas-node-content pdf-embed", dangerouslySetInnerHTML: { __html: ${JSON.stringify(OBS_PDF_TOOLBAR)}.replace("of __PAGES__", node.pdfLabels ? "(1 of " + node.pdfPages + ")" : "of " + node.pdfPages).replace('type="number"', node.pdfLabels ? 'type="text"' : 'type="number"') + '<div class="pdf-container"><div class="pdf-viewer-container"><div class="pdfViewer"><div class="page" data-page-number="1"><img class="pdf-page" src="' + img + '" alt="" draggable="false" loading="lazy" decoding="async"></div></div></div></div>' } })
        ] });
      }
      const embedded = resolveEmbeddedHtml(fileSlug, slug2, allFiles, node.subpath, visited);`],
  // Image boxes, as Obsidian's .media-embed: file name label above, image centered, not draggable.
  ['children: /* @__PURE__ */ u2("img", { src: resolveRelative(slug2, fileSlug), alt: filename, loading: "lazy" })',
    'children: [u2("div", { class: "canvas-file-label", children: u2("a", { href: resolveRelative(slug2, fileSlug), class: "canvas-file-link", children: filename }) }), u2("div", { class: "canvas-node-content media-embed image-embed", children: u2("img", { src: resolveRelative(slug2, fileSlug), alt: filename, draggable: "false", loading: "lazy", decoding: "async" }) })]'],
  // Safari renders Cyrillic with Bulgarian letterforms (based on the system language) unless told
  // otherwise; Obsidian shows the standard forms, so the board asks for them.
  ['class: "canvas-container",', 'class: "canvas-container", lang: "ru",'],
  // Obsidian's zoom range is 2^-4 … 2^1 (the plugin's options don't reach this component).
  ["const minZoom = opts.minZoom ?? 0.1;", "const minZoom = opts.minZoom ?? 0.0625;"],
  ["const maxZoom = opts.maxZoom ?? 5;", "const maxZoom = opts.maxZoom ?? 2;"],
  // Obsidian's zoom controls (same markup and icons); the edit-only buttons are left out.
  [/\/\* @__PURE__ \*\/ u2\("div", \{ class: "canvas-controls", children: \[[\s\S]*?\]\s*\}\),(\s*\/\* @__PURE__ \*\/ u2\("div", \{ class: "canvas-viewport")/,
    `u2("div", { class: "canvas-controls", dangerouslySetInnerHTML: { __html: ${JSON.stringify(OBS_CONTROLS)} } }),$1`],
  // Obsidian's preset colors depend on the theme; the stylesheet defines them per theme.
  [/var CANVAS_PRESET_COLORS = \{[^}]*\};/, `var CANVAS_PRESET_COLORS = { "1": "var(--canvas-color-1)", "2": "var(--canvas-color-2)", "3": "var(--canvas-color-3)", "4": "var(--canvas-color-4)", "5": "var(--canvas-color-5)", "6": "var(--canvas-color-6)" };`],
  // Obsidian shows the note's file name as an inline title at the top of every embed.
  [`u2("div", { class: "canvas-embed-content", dangerouslySetInnerHTML: { __html: embedded } })`,
    `u2("div", { class: "canvas-embed-content", children: [u2("div", { class: "inline-title", children: filename }), u2("div", { dangerouslySetInnerHTML: { __html: embedded } })] })`],
  [/function renderEdge\(edge, nodeMap\) \{[\s\S]*?\n\}\nvar CanvasBody_default/, edgeCode + "var CanvasBody_default"],
  // Obsidian's stacking order: groups, then edges, then edge labels (HTML), then the other nodes.
  [/u2\(\s*"div",\s*\{\s*class: "canvas-nodes",\s*style: (`[^`]*`),\s*children: nodes\.map\(\(node\) => renderNode\(node, renderedTexts, slug2, allFiles, visited\)\)\s*\}\s*\),(\s*\/\* @__PURE__ \*\/ u2\(\s*"svg",[\s\S]*?renderEdge\(edge, nodeMap\)\)\s*\}\s*\))/,
    `u2("div", { class: "canvas-nodes canvas-groups", style: $1, children: nodes.filter((n) => n.type === "group").map((node) => renderNode(node, renderedTexts, slug2, allFiles, visited)) }),$2,
            u2("div", { class: "canvas-path-labels", style: $1, children: edges.map((edge) => renderEdgeLabel(edge, nodeMap)) }),
            u2("div", { class: "canvas-nodes", style: $1, children: nodes.filter((n) => n.type !== "group").map((node) => renderNode(node, renderedTexts, slug2, allFiles, visited)) })`],
  [`class: "canvas-viewport", style: \`width:\${viewWidth}px;height:\${viewHeight}px\``,
    `class: "canvas-viewport", "data-ox": -minX + padding, "data-oy": -minY + padding, style: \`width:\${viewWidth}px;height:\${viewHeight}px\``],
  // The board's client script is ours (.github/board-client/, concatenated in name order).
  [/var canvas_inline_default = '(?:[^'\\]|\\.)*';/, () => `var canvas_inline_default = ${JSON.stringify(boardClient)};`],
]

function apply(dir, files, patches) {
  for (const file of files) {
    const path = `${dir}/${file}`
    let src = fs.readFileSync(path, "utf8")
    for (const [from, to] of patches) {
      const n = typeof from === "string" ? src.split(from).length - 1 : (src.match(new RegExp(from, "g")) ?? []).length
      if (n !== 1) throw new Error(`${path}: expected 1 match, found ${n}: ${String(from).slice(0, 80)}`)
      src = typeof from === "string" ? src.replace(from, () => to) : src.replace(from, to)
    }
    fs.writeFileSync(path, src)
  }
}

apply(dir, ["index.js", "components/index.js"], patches)

// Math: Obsidian renders every formula in the browser with MathJax 4.1.3 (CHTML, mathjax-tex font,
// inline line breaks, size matched to the text font). Do the same instead of rendering at build
// time: the build keeps the TeX in data-tex and this script renders it with Obsidian's settings.
function obsMathToHtml() {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")
  const walk = (node) => {
    if (!node.children) return
    node.children = node.children.map((c) => {
      if (c.type === "inlineMath") return { type: "html", value: `<span class="math math-inline" data-tex="${esc(c.value)}"></span>` }
      if (c.type === "math") return { type: "html", value: `<div class="math math-block" data-tex="${esc(c.value)}"></div>` }
      walk(c)
      return c
    })
  }
  return (tree) => walk(tree)
}

function obsMathClient() {
  if (window.__obsMath) return
  window.__obsMath = true
  window.MathJax = {
    loader: { paths: { "mathjax-tex": "https://cdn.jsdelivr.net/npm/@mathjax/mathjax-tex-font@4.1.3" } },
    tex: { macros: { RequirePackage: ["\\require{#1}", 1], usepackage: ["\\require{#1}", 1] } },
    output: {
      font: "mathjax-tex",
      scale: 1,
      minScale: 0.5,
      matchFontHeight: true,
      mtextInheritFont: false,
      merrorInheritFont: false,
      mathmlSpacing: false,
      exFactor: 0.5,
      displayAlign: "center",
      displayIndent: "0",
      linebreaks: { inline: true, width: "100%", lineleading: 0.2 },
    },
    // Obsidian's options; the menu's own defaults would turn enrichment back on and change spacing.
    options: {
      enableMenu: false,
      enableEnrichment: false,
      enableExplorer: false,
      enableComplexity: false,
      enableAssistiveMml: false,
      menuOptions: { settings: { enrich: false, inTabOrder: false, assistiveMml: false, collapsible: false } },
    },
    startup: { typeset: false },
  }
  // Pages are normally pre-rendered at build time (mathjax-prerender.mjs); MathJax is only loaded
  // if a page still has unrendered formulas.
  let loading = false
  const load = () => {
    if (loading) return
    loading = true
    const s = document.createElement("script")
    s.src = "https://cdn.jsdelivr.net/npm/mathjax@4.1.3/tex-chtml-nofont.js"
    s.async = true
    document.head.append(s)
  }
  let sheet = null
  let busy = false
  const ready = () => new Promise((r) => { const w = () => (window.MathJax?.startup?.promise ? MathJax.startup.promise.then(r) : setTimeout(w, 50)); w() })
  const run = async () => {
    if (busy || !document.querySelector(".math[data-tex]:not(.is-loaded)")) return
    busy = true
    load()
    await ready()
    let els
    while ((els = document.querySelectorAll(".math[data-tex]:not(.is-loaded)")).length) {
      let i = 0
      for (const el of els) {
        const display = el.classList.contains("math-block") || !!el.parentElement?.classList.contains("obs-math-block")
        try {
          el.replaceChildren(await MathJax.tex2chtmlPromise(el.dataset.tex, { display }))
        } catch {
          el.textContent = el.dataset.tex
        }
        el.classList.add("is-loaded")
        if (++i % 40 === 0) await new Promise((r) => setTimeout(r))
      }
      const e = MathJax.chtmlStylesheet()
      if (sheet !== e) { sheet?.remove(); sheet = e; document.head.append(e) }
    }
    busy = false
  }
  document.addEventListener("nav", run)
  new MutationObserver(() => run()).observe(document.documentElement, { childList: true, subtree: true })
  run()
}

apply("node_modules/@quartz-community/latex/dist", ["index.js"], [
  ["return [remarkMath];", "return [remarkMath, obsMathToHtml];"],
  [/case "mathjax": \{\s*return \[\s*\[\s*svg_default,[\s\S]*?\]\s*\];\s*\}/, `case "mathjax": {\n          return [];\n        }`],
  ["externalResources() {\n      switch (engine) {", `externalResources() {\n      switch (engine) {\n        case "mathjax":\n          return { js: [{ loadTime: "afterDOMReady", contentType: "inline", spaPreserve: true, script: ${JSON.stringify("(" + obsMathClient.toString() + ")()")} }] };`],
  ["var Latex = (opts) => {", obsMathToHtml.toString() + "\nvar Latex = (opts) => {"],
])
console.log("canvas-page and latex patched to render like Obsidian")
