// Build step (after `quartz build`): render every formula into the pages with MathJax 4.1.3 and
// Obsidian's settings, so phones get finished math instead of running MathJax on ~2000 formulas.
// Writes one shared stylesheet and preloads the math fonts, so they don't arrive mid-gesture and
// force a relayout of the whole board.
// Usage: node mathjax-prerender.mjs <built site dir>   (needs mathjax@4.1.3,
//   @mathjax/mathjax-tex-font@4.1.3 and @mathjax/mathjax-mhchem-font-extension@4.1.3 installed)
import fs from "fs"
import path from "path"

const site = process.argv[2]
const FONT_URL = "https://cdn.jsdelivr.net/npm/@mathjax/mathjax-tex-font@4.1.3/chtml/woff2"
// Obsidian 1.14's TeX packages and output options
const packages = ["base", "ams", "newcommand", "textmacros", "noundefined", "require", "autoload", "configmacros", "action", "amscd",
  "bbox", "boldsymbol", "braket", "bussproofs", "cancel", "cases", "centernot", "color", "colortbl", "empheq", "enclose", "extpfeil",
  "gensymb", "html", "mathtools", "mhchem", "noerrors", "tagformat", "textcomp", "unicode", "upgreek", "verb"]
const preloaded = ["base", "ams", "newcommand", "noundefined", "require", "autoload", "configmacros"]
const MathJax = await (await import("mathjax")).init({
  loader: { load: ["input/tex", "output/chtml", "adaptors/liteDOM", ...packages.filter((p) => !preloaded.includes(p)).map((p) => `[tex]/${p}`)] },
  tex: { packages, macros: { RequirePackage: ["\\require{#1}", 1], usepackage: ["\\require{#1}", 1] } },
  output: {
    font: "mathjax-tex", fontURL: FONT_URL, scale: 1, minScale: 0.5, matchFontHeight: true, mtextInheritFont: false,
    merrorInheritFont: false, mathmlSpacing: false, exFactor: 0.5, displayAlign: "center", displayIndent: "0",
    linebreaks: { inline: true, width: "100%", lineleading: 0.2 },
  },
  startup: { typeset: false },
})
const adaptor = MathJax.startup.adaptor
const NAMED = { amp: "&", quot: '"', lt: "<", gt: ">", apos: "'" }
const unesc = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (e, c) => c[0] === "#" ? String.fromCodePoint(c[1].toLowerCase() === "x" ? parseInt(c.slice(2), 16) : +c.slice(1)) : NAMED[c] ?? e)
const MATH = /(<span class="obs-math-block">)?<(span|div) class="math (math-inline|math-block)" data-tex="([^"]*)"><\/\2>/g

const files = []
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".html") && files.push(path.join(d, e.name)) }
walk(site)
let count = 0
const pages = []
for (const f of files) {
  const html = fs.readFileSync(f, "utf8")
  if (!html.includes('data-tex="')) continue
  const parts = []
  let last = 0
  for (const m of html.matchAll(MATH)) {
    const display = !!m[1] || m[3] === "math-block"
    const out = adaptor.outerHTML(await MathJax.tex2chtmlPromise(unesc(m[4]), { display }))
    parts.push(html.slice(last, m.index), `${m[1] ?? ""}<${m[2]} class="math ${m[3]} is-loaded" data-tex="${m[4]}">${out}</${m[2]}>`)
    last = m.index + m[0].length
    count++
  }
  parts.push(html.slice(last))
  pages.push([f, parts.join("")])
}
const css = adaptor.textContent(MathJax.chtmlStylesheet())
fs.writeFileSync(path.join(site, "static", "mathjax.css"), css)
// All TeX fonts (~320 kB, cached across pages): some are only reached through MathJax's CSS
// (stretchy delimiters, line breaks), so per-page detection would miss them.
const fonts = [...new Set([...css.matchAll(/url\("?([^")]+\/mjx-tex-[a-z0-9]+\.woff2)"?\)/g)].map((m) => m[1]))]
for (const [f, html] of pages) {
  const rel = path.relative(path.dirname(f), path.join(site, "static", "mathjax.css")).split(path.sep).join("/")
  const head = `<link rel="stylesheet" href="${rel}">` + fonts.map((u) => `<link rel="preload" as="font" type="font/woff2" crossorigin href="${u}">`).join("")
  fs.writeFileSync(f, html.replace("</head>", head + "</head>"))
}
console.log(`prerendered ${count} formulas in ${pages.length} pages; ${fonts.length} math fonts preloaded`)
