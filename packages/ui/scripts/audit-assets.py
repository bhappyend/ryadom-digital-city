"""Read-only asset, token, manifest, font provenance and SVG safety validation.

Run from repo: python packages/ui/scripts/audit-assets.py
One initial snapshot: add --write-manifest. Requires Pillow for image decoding.
"""
from pathlib import Path
from collections import Counter
import hashlib
import json
import re
import struct
import sys
import xml.etree.ElementTree as ET
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / 'ryadom-digital-city/assets'
PUBLIC = ROOT / 'apps/web/public/assets'
SNAPSHOT = ROOT / 'packages/ui/asset-manifest.json'
records = []
allowed_tags = {'svg', 'g', 'path', 'rect', 'circle', 'text', 'defs', 'linearGradient',
                'radialGradient', 'stop', 'filter', 'feGaussianBlur', 'ellipse', 'line',
                'polyline', 'polygon', 'clipPath'}
for path in sorted(SOURCE.rglob('*')):
    if not path.is_file():
        continue
    data = path.read_bytes()
    rel = path.relative_to(SOURCE).as_posix()
    assert (PUBLIC / rel).read_bytes() == data, f'Copy mismatch: {rel}'
    item = {'file': rel, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
    if path.suffix == '.svg':
        assert b'<!DOCTYPE' not in data.upper() and b'<!ENTITY' not in data.upper()
        svg = ET.fromstring(data)
        assert svg.tag == '{http://www.w3.org/2000/svg}svg'
        item['viewBox'] = svg.attrib['viewBox']
        for node in svg.iter():
            assert node.tag.split('}')[-1] in allowed_tags, (rel, node.tag)
            for key, value in node.attrib.items():
                key = key.split('}')[-1]
                assert not key.lower().startswith('on') and key not in {'href', 'src', 'style'}, (rel, key)
                for url in re.findall(r'url\(([^)]+)\)', value):
                    assert url.startswith('#'), (rel, url)
        ids = {n.attrib['id'] for n in svg.iter() if 'id' in n.attrib}
        for node in svg.iter():
            for value in node.attrib.values():
                for ref in re.findall(r'url\(#([^)]+)\)', value):
                    assert ref in ids, (rel, ref)
    elif path.suffix.lower() in {'.png', '.webp', '.ico'}:
        with Image.open(path) as image:
            image.load()
            item['dimensions'] = list(image.size)
            item['format'] = image.format
    records.append(item)

for filename in ['tokens.css', 'tokens.json']:
    target = ROOT / ('packages/ui/src/tokens.css' if filename.endswith('css') else 'packages/ui/tokens.json')
    assert target.read_bytes() == (ROOT / 'ryadom-digital-city/design' / filename).read_bytes(), filename

manifest = json.loads((ROOT / 'ryadom-digital-city/design/manifest.example.webmanifest').read_text(encoding='utf-8'))
assert manifest['lang'] == 'ru' and manifest['theme_color'] == '#061217'
for icon in manifest['icons']:
    path = ROOT / 'apps/web/public' / icon['src'].lstrip('/')
    with Image.open(path) as image:
        assert icon['sizes'] == f'{image.width}x{image.height}'
    assert icon['purpose'] in {'any', 'maskable'}

folder = PUBLIC / 'fonts/manrope'
provenance = json.loads((folder / 'provenance.json').read_text(encoding='utf-8'))
assert provenance['license'] == 'OFL-1.1'
assert 'SIL OPEN FONT LICENSE Version 1.1' in (folder / 'LICENSE').read_text(encoding='utf-8')
for file in provenance['files']:
    data = (folder / file['file']).read_bytes()
    assert len(data) == file['bytes'] and hashlib.sha256(data).hexdigest() == file['sha256']
    if file['file'].endswith('.woff2'):
        assert data[:4] == b'wOF2' and struct.unpack('>I', data[8:12])[0] == len(data)
css = (ROOT / 'packages/ui/src/fonts.css').read_text(encoding='utf-8')
assert 'U+0400-045F' in css and 'U+20AD-20C0' in css  # Russian and ruble sign ranges.
for url in re.findall(r'url\(([^)]+)\)', css):
    assert url.startswith('/assets/fonts/manrope/files/')
    assert (ROOT / 'apps/web/public' / url.lstrip('/')).is_file()

snapshot = {'source': 'ryadom-digital-city/assets', 'files': records}
if '--write-manifest' in sys.argv:
    SNAPSHOT.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
else:
    assert json.loads(SNAPSHOT.read_text(encoding='utf-8')) == snapshot, 'Original asset snapshot changed'
counts = Counter(Path(item['file']).suffix for item in records)
print('PASS:', len(records), 'byte-identical assets;', dict(counts))
print('PASS: all SVG XML parses; no scripts, event handlers or external references; local IDs resolve')
print('PASS: PNG/WebP/ICO decode, tokens byte-identical, all 4 manifest icons resolve at declared sizes')
print('PASS: font OFL, hashes, six WOFF2 headers, local CSS URLs and declared Cyrillic/ruble ranges')
