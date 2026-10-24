"""Строи <предмет>/Табло.canvas от файловете в лекции/ и задачи/.

Употреба: python3 scripts/build_board.py "<предмет>"   (от корена на хранилището)

Ред: решените примери (задачи/NN-KK-*.md) са над лекцията, лекцията (лекции/NN-*.md) е в група
заедно с първия източник от реда `Източници:`, а основите ([[линкове]] към Основи/ или към
лекции от други предмети) са отдолу. Възлите, които потребителят сам е добавил (id без префикс
"gen-"), се запазват, както и стрелките между тях. Пише и <предмет>/Табло (списък).md: същото като
списък, за телефон.
"""
import glob, json, os, re, sys

subj = sys.argv[1].rstrip("/")
out = f"{subj}/Табло.canvas"
all_md = {os.path.splitext(os.path.basename(p))[0]: p for p in glob.glob("**/*.md", recursive=True)}

def links(path):
    return re.findall(r"(?<!!)\[\[([^\]|#]+)", open(path).read())

def prereqs(paths):
    seen = []
    for p in paths:
        for name in links(p):
            t = all_md.get(name.strip().split("/")[-1])
            if t and (t.startswith("Основи/") or not t.startswith(subj + "/")) and t not in seen:
                seen.append(t)
    return seen

def source(path):
    m = re.search(r"^Източници:(.*)$", open(path).read(), re.M)
    for s in re.findall(r"`([^`]+)`", m.group(1) if m else ""):
        p = f"{subj}/{s}"
        if os.path.isfile(p):
            return p
        p = glob.glob(p)  # позволява `.../*.jpg`
        if p:
            return sorted(p)[0]
    return None

lectures = sorted(p for p in glob.glob(f"{subj}/лекции/[0-9]*.md"))
nodes, edges, placed = [], [], {}
lst = [f"# Табло: {subj}", "", f"Визуалното табло: [[{out}|Табло.canvas]]", ""]
nm = lambda p: os.path.splitext(os.path.basename(p))[0]
wl = lambda p: f"[[{p[:-3]}|{nm(p) if ' ' in nm(p) else nm(p).replace('-', ' ')}]]"
fnode = lambda i, f, x, y, w, h, c=None: {"id": i, "type": "file", "file": f, "x": x, "y": y, "width": w, "height": h, **({"color": c} if c else {})}
edge = lambda a, b, fs, ts, l=None: {"id": f"gen-e-{a}-{b}", "fromNode": a, "fromSide": fs, "toNode": b, "toSide": ts, **({"label": l} if l else {})}
EX_W, EX_H, EX_GAP, PER_ROW = 380, 460, 30, 3
top = -200
base_x_next = {}

for i, lec in enumerate(lectures):
    num = os.path.basename(lec).split("-")[0]
    x = i * 1400
    title = os.path.splitext(os.path.basename(lec))[0].replace("-", " ")
    nodes.append({"id": f"gen-g{num}", "type": "group", "x": x, "y": 0, "width": 1200, "height": 920, "label": title})
    nodes.append(fnode(f"gen-L{num}", lec, x + 20, 40, 620, 860, "4"))
    src = source(lec)
    if src:
        nodes.append(fnode(f"gen-S{num}", src, x + 660, 40, 520, 860))
    if i:
        prev = os.path.basename(lectures[i - 1]).split("-")[0]
        edges.append(edge(f"gen-L{prev}", f"gen-L{num}", "right", "left", "следва"))
    exs = sorted(glob.glob(f"{subj}/задачи/{num}-*.md"))
    for k, ex in enumerate(exs):
        r, c = divmod(k, PER_ROW)
        y = -80 - EX_H - r * (EX_H + EX_GAP)
        top = min(top, y)
        nid = f"gen-X{num}-{k}"
        nodes.append(fnode(nid, ex, x + c * (EX_W + EX_GAP), y, EX_W, EX_H, "3"))
        edges.append(edge(f"gen-L{num}", nid, "top", "bottom"))
    lst += [f"## {title}", f"- Лекция: {wl(lec)}"]
    lst += ["- Примери:"] + [f"    - {wl(e)}" for e in exs] if exs else []
    pre = prereqs([lec] + exs)
    lst += ["- Основи:"] + [f"    - {wl(b)}" for b in pre] if pre else []
    lst += [""]
    for b in pre:
        if b in placed:
            edges.append(edge(f"gen-L{num}", placed[b], "bottom", "top", "нужно ти е"))
            continue
        j = base_x_next.get(i, 0)
        base_x_next[i] = j + 1
        bid = f"gen-B{len(placed)}"
        placed[b] = bid
        nodes.append(fnode(bid, b, x + (j % 2) * 620, 1060 + (j // 2) * 600, 560, 540, "5"))
        edges.append(edge(f"gen-L{num}", bid, "bottom", "top", "нужно ти е"))

kon = f"{subj}/лекции/Конспект.md"
if os.path.isfile(kon):
    nodes.append(fnode("gen-konspekt", kon, -900, 40, 620, 860, "6"))
nodes.insert(0, {"id": "gen-title", "type": "text", "x": 0, "y": top - 260, "width": 1200, "height": 180, "color": "6",
                 "text": f"# {subj}\nЛекциите са хронологично отляво надясно. Над всяка лекция са решените примери от нея, а под нея са основите, които са нужни."})

if os.path.isfile(out):
    old = json.load(open(out))
    if any(n["id"].startswith("gen-") for n in old["nodes"]):  # стари табла без gen- се строят наново
        keep = [n for n in old["nodes"] if not n["id"].startswith("gen-")]
        ids = {n["id"] for n in nodes + keep}
        nodes += keep
        edges += [e for e in old["edges"] if not e["id"].startswith("gen-") and e["fromNode"] in ids and e["toNode"] in ids]

missing = [n["file"] for n in nodes if n["type"] == "file" and not os.path.exists(n["file"])]
assert not missing, missing
json.dump({"nodes": nodes, "edges": edges}, open(out, "w"), ensure_ascii=False, indent=1)
open(f"{subj}/Табло (списък).md", "w").write("\n".join(lst))
print(f"{out}: {len(lectures)} лекции, {sum(n['id'].startswith('gen-X') for n in nodes)} примера, {len(placed)} основи")
