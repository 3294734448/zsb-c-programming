"""Package the published single-file pages without machine-specific dependencies."""
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1]
output = root / 'downloads' / 'zsb-c-materials.zip'
output.parent.mkdir(exist_ok=True)
files = ['index.html', 'knowledge.html', 'C语言编程题库.html']
with ZipFile(output, 'w', compression=ZIP_DEFLATED) as archive:
    for name in files:
        content = (root / name).read_bytes()
        if name == 'index.html':
            text = content.decode('utf-8')
            start = text.index('    <aside class="backup">')
            end = text.index('    </aside>', start) + len('    </aside>')
            text = text[:start] + '    <aside class="backup"><h2>离线资料包</h2><p>本资料包包含完整学习内容，可断网阅读。请保留三个 HTML 文件在同一文件夹中，以便在资料之间跳转。</p></aside>' + text[end:]
            content = text.encode('utf-8')
        info = ZipInfo(name, (2026, 10, 26, 0, 0, 0))
        info.compress_type = ZIP_DEFLATED
        archive.writestr(info, content)
print(f'Offline package: {output.name} ({output.stat().st_size} bytes)')
