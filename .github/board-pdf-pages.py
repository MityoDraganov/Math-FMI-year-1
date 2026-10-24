"""Build step (after obsidian-compat.py): pictures of every page of the PDFs on the boards, so a
focused PDF box scrolls through all its pages like Obsidian's PDF viewer.
Runs on the CI copy of the vault.  Usage: python3 board-pdf-pages.py <vault dir>

Pages 2..N go to `<file>.pdf.pages/{m,l}-NNN.png` in two widths (page 1 is obsidian-compat.py's
`pdfPage1`). The page script picks the tier from the box's size on screen: m (780 px) up to a
box about as wide as a phone screen at 2x, l (1560 px = a 520 px box at 3x) beyond that.
A PDF that is on a board several times is rendered once. Each node gets `pdfPagesDir` and
`pdfSizes` (width, height in points of every page: pdf.js sizes the pages from these) and, when
the PDF has page labels, `pdfPageLabels` (pdf.js shows the label in the page input).
"""
import json, pathlib, re, subprocess, sys, tempfile, zlib
from PIL import Image

vault = pathlib.Path(sys.argv[1])
TIERS = {"l": 1560, "m": 780}  # width px (l first: m is scaled down from it)
COLORS = 32  # the pages are text and line art: a 32-color PNG is ~1/3 of a JPEG and sharper



def roman(n):
    out = ""
    for v, r in ((1000, "m"), (900, "cm"), (500, "d"), (400, "cd"), (100, "c"), (90, "xc"), (50, "l"), (40, "xl"), (10, "x"), (9, "ix"), (5, "v"), (4, "iv"), (1, "i")):
        while n >= v:
            out, n = out + r, n - v
    return out


def page_labels(pdf, n):
    """The /PageLabels number tree when it is written out plainly (one level of indirection);
    None otherwise, and then the page numbers are shown."""
    data = pdf.read_bytes()
    chunks = [data]
    for m in re.finditer(rb"stream\r?\n(.*?)endstream", data, re.S):
        try:
            chunks.append(zlib.decompress(m[1]))
        except zlib.error:
            pass
    text = b"\n".join(chunks).decode("latin-1")

    def deref(s):
        m = re.match(r"\s*(\d+) 0 R", s)
        if not m:
            return s
        o = re.search(rf"(?<!\d){m[1]} 0 obj\s*(.*?)endobj", text, re.S)
        return o[1] if o else ""

    m = re.search(r"/PageLabels\s*(\d+ 0 R|<<)", text)
    if not m:
        return None
    tree = deref(text[m.start(1):])
    nums = re.search(r"/Nums\s*(\d+ 0 R|\[)", tree)
    if not nums:
        return None
    arr = deref(tree[nums.start(1):])
    arr = arr[arr.index("[") + 1:arr.index("]")] if "[" in arr else ""
    ranges = [(int(a), d) for a, d in re.findall(r"(\d+)\s*<<(.*?)>>", arr, re.S)]
    if not ranges:
        return None
    labels = []
    for i in range(n):
        start, d = max((r for r in ranges if r[0] <= i), default=ranges[0], key=lambda r: r[0])
        style = re.search(r"/S\s*/([DRrAa])", d)
        prefix = re.search(r"/P\s*\((.*?)\)", d)
        k = i - start + int((re.search(r"/St\s*(\d+)", d) or [0, 1])[1])
        s = style[1] if style else ""
        num = str(k) if s == "D" else roman(k) if s == "r" else roman(k).upper() if s == "R" else \
            chr(97 + (k - 1) % 26) * ((k - 1) // 26 + 1) if s == "a" else chr(65 + (k - 1) % 26) * ((k - 1) // 26 + 1) if s == "A" else ""
        labels.append((prefix[1] if prefix else "") + num)
    return labels


done = {}
for board in vault.rglob("*.canvas"):
    data = json.loads(board.read_text())
    changed = False
    for node in data["nodes"]:
        if not node.get("pdfPage1"):
            continue
        pdf = node["file"]
        if pdf not in done:
            src = vault / pdf
            n = node["pdfPages"]
            info = subprocess.run(["pdfinfo", "-f", "1", "-l", str(n), src], capture_output=True, text=True, check=True).stdout
            sizes = []
            for m in re.finditer(r"^Page\s+\d+ size:\s+([\d.]+) x ([\d.]+).*\n(?:Page\s+\d+ rot:\s+(\d+))?", info, re.M):
                w, h = float(m[1]), float(m[2])
                if m[3] and int(m[3]) % 180:
                    w, h = h, w
                sizes += [round(w, 2), round(h, 2)]
            out = src.with_name(src.name + ".pages")
            out.mkdir(exist_ok=True)
            if n > 1:
                with tempfile.TemporaryDirectory() as tmp:
                    subprocess.run(["pdftoppm", "-f", "2", "-l", str(n), "-scale-to-x", str(TIERS["l"]), "-scale-to-y", "-1",
                                    "-png", src, f"{tmp}/p"], check=True, capture_output=True)
                    for f in pathlib.Path(tmp).iterdir():
                        num = int(f.stem.rsplit("-", 1)[1])
                        im = Image.open(f).convert("RGB")
                        for tier, width in TIERS.items():
                            if im.width != width:
                                im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
                            im.quantize(colors=COLORS, dither=Image.Dither.NONE).save(out / f"{tier}-{num:03d}.png", optimize=True)
            labels = page_labels(src, n) if node.get("pdfLabels") else None
            done[pdf] = (pathlib.PurePosixPath(pdf).with_name(out.name).as_posix(), sizes, labels)
        node["pdfPagesDir"], node["pdfSizes"], labels = done[pdf]
        if labels:
            node["pdfPageLabels"] = labels
        changed = True
    if changed:
        board.write_text(json.dumps(data, ensure_ascii=False))
