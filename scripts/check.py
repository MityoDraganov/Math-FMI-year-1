"""Проверки на хранилището (пуска се в CI и на ръка): python3 scripts/check.py

1. Всеки [[линк]] в .md файловете сочи към съществуващ файл.
2. Всеки път от реда `Източници:` съществува (спрямо папката на предмета).
3. Таблата са актуални: build_board.py не би променил съдържанието на Табло.canvas
   (сравнява се JSON-ът, защото Obsidian форматира файла по свой начин) и Табло (списък).md.
"""
import glob, json, os, re, subprocess, sys

SKIP = {"CLAUDE.md"}  # примерни линкове в инструкциите
files = [p for p in glob.glob("**/*", recursive=True) if os.path.isfile(p)]
names = {os.path.basename(p) for p in files} | {os.path.splitext(os.path.basename(p))[0] for p in files}
errors = []

for md in glob.glob("**/*.md", recursive=True):
    if md in SKIP:
        continue
    text = open(md).read()
    for link in re.findall(r"(?<!`)\[\[([^\]|#]+)", text):
        n = link.strip()
        if not (os.path.exists(n) or os.path.exists(n + ".md") or n.split("/")[-1] in names):
            errors.append(f"{md}: счупен линк [[{n}]]")
    src = re.search(r"^Източници:(.*)$", text, re.M)
    for s in re.findall(r"`([^`]+)`", src.group(1)) if src else []:
        if not glob.glob(f"{md.split('/')[0]}/{s}"):
            errors.append(f"{md}: липсва източник `{s}`")

for subj in sorted(d for d in os.listdir(".") if os.path.isdir(f"{d}/лекции")):
    canvas, lst = f"{subj}/Табло.canvas", f"{subj}/Табло (списък).md"
    before = {p: open(p).read() for p in (canvas, lst) if os.path.exists(p)}
    subprocess.run([sys.executable, "scripts/build_board.py", subj], check=True, capture_output=True)
    if canvas not in before or json.loads(before[canvas]) != json.load(open(canvas)) \
            or before.get(lst) != open(lst).read():
        errors.append(f'{subj}: таблото е остаряло, пусни python3 scripts/build_board.py "{subj}"')
    for p, t in before.items():  # връща файловете, както са били
        open(p, "w").write(t)

print("\n".join(errors) or "OK")
sys.exit(1 if errors else 0)
