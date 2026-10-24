"""Build step: make the CI copy of the vault render on the site the way it does in Obsidian.
Runs on the CI copy of the vault, never on the notes.  Usage: python3 obsidian-compat.py <vault dir>

Math. Obsidian shows `$$...$$` as a centered block wherever it is, also inside a paragraph, keeps
text written on the `$$` lines, and swallows the line break right after the formula. Quartz's
parser treats `$$...$$` inside a paragraph as inline math and drops text after an opening `$$`
fence. So each formula becomes inline math in a marker span (or a block element for multi-line
formulas), which the page script renders in display mode.

Task lists. Obsidian parses `- [x] 1. text` as a task item that contains a numbered list.

Board files. `материали/` stays unpublished; only the files the boards show are copied to
`_board-files/` (same relative paths minus the `материали` folder), and the boards point there.
Each PDF gets an image of its first page, which is what Obsidian shows in the box, and its page
count for the toolbar.
"""
import json, pathlib, re, shutil, subprocess, sys, zlib

vault = pathlib.Path(sys.argv[1])

# A `$$` that opens a line and closes on a later line is its own block in Obsidian.
BLOCK = re.compile(r"^([ \t>]*)\$\$(?![^\n]*\$\$)([\s\S]+?)\$\$[ \t]*$", re.M)
# Any other `$$...$$` stays in its paragraph; the line break after it is swallowed unless the
# next line starts a list item, heading, quote or table row.
MATH = re.compile(r"\$\$([\s\S]+?)\$\$(\n(?=[ \t]*\S)(?![ \t]*(?:[-*+][ \t]|\d+[.)][ \t]|#|>|\|)))?")
TASK_NUM = re.compile(r"^([ \t]*)([-*+]) \[(.)\] (\d+)[.)] (.*)$", re.M)
FENCED = re.compile(r"(^\s*(?:```|~~~)[\s\S]*?^\s*(?:```|~~~)[^\n]*$)", re.M)


def esc(tex):
    return tex.replace("&", "&amp;").replace('"', "&quot;").replace("<", "&lt;").replace("\n", "&#10;")


def convert(text):
    text = TASK_NUM.sub(lambda m: f'{m[1]}{m[2]} [{m[3]}] <ol start="{m[4]}"><li>{m[5]}</li></ol>', text)
    text = BLOCK.sub(lambda m: f'\n{m[1]}<div class="math math-block" data-tex="{esc(m[2].strip())}"></div>\n', text)
    return MATH.sub(lambda m: f'<span class="obs-math-block">${m[1].strip()}$</span>', text)


for p in vault.rglob("*.md"):
    src = p.read_text()
    # leave fenced code blocks alone: odd-numbered parts are the fences
    new = "".join(part if i % 2 else convert(part) for i, part in enumerate(FENCED.split(src)))
    if new != src:
        p.write_text(new)

def has_page_labels(pdf):
    data = pdf.read_bytes()
    if b"/PageLabels" in data:
        return True
    for m in re.finditer(rb"stream\r?\n(.*?)endstream", data, re.S):
        try:
            if b"/PageLabels" in zlib.decompress(m[1]):
                return True
        except zlib.error:
            pass
    return False


FILES = pathlib.Path("_board-files")
for board in vault.rglob("*.canvas"):
    data = json.loads(board.read_text())
    for node in data["nodes"]:
        src = node.get("file", "")
        if node.get("type") != "file" or src.endswith(".md") or not (vault / src).is_file():
            continue
        dest = FILES / src.replace("/материали/", "/")  # keep clear of the ignored folder name
        (vault / dest).parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(vault / src, vault / dest)
        node["file"] = dest.as_posix()
        if src.lower().endswith(".pdf"):
            info = subprocess.run(["pdfinfo", vault / dest], capture_output=True, text=True, check=True).stdout
            node["pdfPages"] = int(re.search(r"^Pages:\s+(\d+)", info, re.M)[1])
            node["pdfLabels"] = has_page_labels(vault / dest)  # Obsidian then shows "(1 of N)"
            # 1560 px = a 520 px box at 3x (phone screens)
            out = vault / dest.with_name(dest.name + ".page1")
            subprocess.run(["pdftoppm", "-f", "1", "-l", "1", "-singlefile", "-scale-to-x", "1560", "-scale-to-y", "-1",
                            "-jpeg", "-jpegopt", "quality=85", vault / dest, out], check=True, capture_output=True)
            node["pdfPage1"] = dest.with_name(dest.name + ".page1.jpg").as_posix()
    board.write_text(json.dumps(data, ensure_ascii=False))
