#!/usr/bin/env python3
"""Cria uma prévia HTML autônoma; downloads reais pertencem ao pacote hospedado."""
import base64
from pathlib import Path
import re
import sys

root = Path(__file__).resolve().parent.parent
public = root / 'services' / 'web' / 'public'
output = Path(sys.argv[1]).resolve()
html = (public / 'index.html').read_text()
css = (public / 'style.css').read_text()
js = (public / 'app.js').read_text()

def data_url(name):
    suffix = Path(name).suffix
    mime = {'.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2'}[suffix]
    return 'data:' + mime + ';base64,' + base64.b64encode((public / 'assets' / name).read_bytes()).decode()

css = css.replace('/assets/inter-latin.woff2', data_url('inter-latin.woff2'))
js = js.replace('loadRelease();', "download.setAttribute('aria-disabled','true');download.querySelector('span').textContent='Download após publicação';document.querySelector('#download-meta').textContent='Prévia local do site · O download real está no pacote de hospedagem.';")
html = html.replace('<link rel="stylesheet" href="/style.css">', '<style>' + css + '</style>')
html = html.replace('<script src="/app.js" defer></script>', '')
html = re.sub(r'(["\'])/assets/([a-z0-9_.-]+)(["\'])', lambda m: m[1] + data_url(m[2]) + m[3], html)
html = html.replace('CONHEÇA A ALPHA 0.1.2', 'PRÉVIA LOCAL · ALPHA 0.1.2')
html = html.replace('</body>', '<script>' + js + '</script></body>')
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(html)
print(output)
