import re

with open('page_blank.html', 'r', encoding='utf-8') as f:
    content = f.read()

def replace_tooltip(match):
    title = match.group(1)
    return f' class="toolbar-item">\n        <span class="custom-tooltip">{title}</span>'

content = re.sub(r' title="([^"]+)" class="toolbar-item">', replace_tooltip, content)

with open('page_blank.html', 'w', encoding='utf-8') as f:
    f.write(content)
