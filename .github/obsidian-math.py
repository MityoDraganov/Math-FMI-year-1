"""Build step: parse a few Markdown constructs the way Obsidian does.

Math: make every `$$...$$` render as a display formula like Obsidian.

Obsidian shows `$$...$$` as a centered block wherever it is, also inside a paragraph, keeps text
written on the `$$` lines, and swallows the line break right after the formula. Quartz's parser
treats `$$...$$` inside a paragraph as inline math and drops text after an opening `$$` fence.
So each formula becomes inline math in a marker span, which the page script renders in display
mode. Runs on the CI copy of the vault, never on the notes.
Usage: python3 obsidian-math.py <vault dir>
"""
import pathlib, re, sys

FENCE = re.compile(r"^\s*(```|~~~)", re.M)
# A `$$` that opens a line and closes on a later line is its own block in Obsidian.
BLOCK = re.compile(r"^([ \t>]*)\$\$(?![^\n]*\$\$)([\s\S]+?)\$\$[ \t]*$", re.M)
# Any other `$$...$$` stays in its paragraph; the line break after it is swallowed unless the
# next line starts a list item, heading, quote or table row.
MATH = re.compile(r"\$\$([\s\S]+?)\$\$(\n(?=[ \t]*\S)(?![ \t]*(?:[-*+][ \t]|\d+[.)][ \t]|#|>|\|)))?")


# Obsidian parses `- [x] 1. text` as a task item that contains a numbered list.
TASK_NUM = re.compile(r"^([ \t]*)([-*+]) \[(.)\] (\d+)[.)] (.*)$", re.M)


def esc(tex):
    return tex.replace("&", "&amp;").replace('"', "&quot;").replace("<", "&lt;").replace("\n", "&#10;")


def convert(text):
    text = TASK_NUM.sub(lambda m: f'{m[1]}{m[2]} [{m[3]}] <ol start="{m[4]}"><li>{m[5]}</li></ol>', text)
    text = BLOCK.sub(lambda m: f'\n{m[1]}<div class="math math-block" data-tex="{esc(m[2].strip())}"></div>\n', text)
    return MATH.sub(lambda m: f'<span class="obs-math-block">${m[1].strip()}$</span>', text)


for p in pathlib.Path(sys.argv[1]).rglob("*.md"):
    src = p.read_text()
    # leave fenced code blocks alone: even-numbered parts are outside fences
    parts = re.split(r"(^\s*(?:```|~~~)[\s\S]*?^\s*(?:```|~~~)[^\n]*$)", src, flags=re.M)
    new = "".join(part if i % 2 else convert(part) for i, part in enumerate(parts))
    if new != src:
        p.write_text(new)
