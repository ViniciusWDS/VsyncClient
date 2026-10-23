#!/usr/bin/env python3
"""Empacota o site e um instalador verificado, sem credenciais ou dependências locais."""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('--installer', required=True)
parser.add_argument('--output', required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
version = json.loads((root / 'package.json').read_text())['version']
installer = Path(args.installer).resolve()
if installer.name != f'Vsync-Client-Setup-{version}.exe' or not installer.is_file() or installer.is_symlink():
    raise SystemExit('Selecione o instalador regular da versão atual.')
digest = hashlib.sha256()
with installer.open('rb') as stream:
    if stream.read(2) != b'MZ':
        raise SystemExit('O arquivo não possui cabeçalho executável Windows.')
    stream.seek(0)
    for chunk in iter(lambda: stream.read(1024 * 1024), b''):
        digest.update(chunk)
site = root / 'services' / 'web'
metadata = json.loads((site / 'releases' / 'release.json').read_text())
metadata.update(version=version, filename=installer.name, bytes=installer.stat().st_size, sha256=digest.hexdigest(), signed=False, windowsValidated=False)
metadata.pop('available', None)
output = Path(args.output).resolve()
output.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
    for file in sorted(site.rglob('*')):
        relative = file.relative_to(site)
        if not file.is_file() or file.is_symlink() or any(p in {'node_modules', 'test', '.git', 'test-results'} for p in relative.parts):
            continue
        if any(p.startswith('.') and p != '.discloudignore' for p in relative.parts):
            continue
        if file.suffix.lower() in {'.exe', '.pem', '.key', '.pfx', '.log'} or relative.as_posix() == 'releases/release.json':
            continue
        archive.write(file, relative.as_posix())
    archive.write(root / 'LICENSE', 'LICENSE')
    archive.write(installer, 'releases/' + installer.name, compress_type=zipfile.ZIP_STORED)
    archive.writestr('releases/release.json', json.dumps(metadata, ensure_ascii=False, indent=2) + '\n')
with zipfile.ZipFile(output) as archive:
    if archive.testzip() is not None:
        raise SystemExit('Falha na integridade do pacote de hospedagem.')
print(json.dumps({'file': str(output), 'bytes': output.stat().st_size, 'installerSha256': digest.hexdigest(), 'published': False}, ensure_ascii=False))
