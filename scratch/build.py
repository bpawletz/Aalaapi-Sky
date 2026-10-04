import re
import os
import sys

IMPORT_HEADER_RE = re.compile(
    rb"\A(?:\s*(?://[^\n]*\n|/\*.*?\*/\s*)*"
    rb"\s*import\s[^;]*?['\"][^'\"]+['\"]\s*;?[^\n]*\n)+",
    re.DOTALL
)
SIDE_EFFECT_IMPORT_RE = re.compile(rb"^\s*import\s+['\"](\./[^'\"]+)['\"]\s*;?", re.M)
EXPORT_PREFIX_RE = re.compile(rb"^export\s+(?=(?:async\s+)?function\b|const\b|let\b|var\b|class\b)", re.M)

def strip_import_header(content_bytes):
    m = IMPORT_HEADER_RE.match(content_bytes)
    if not m:
        return content_bytes
    header = m.group(0)
    lines = header.split(b'\n')
    kept = []
    for line in lines:
        stripped = line.strip()
        if stripped.startswith(b'import ') or (stripped.startswith(b'import') and b"'" in stripped):
            continue
        kept.append(line)
    rest = content_bytes[len(header):]
    return (b'\n'.join(kept) + rest).lstrip(b'\r\n')

def bundle(src_dir, banners=True):
    main_path = os.path.join(src_dir, 'main.js')
    if not os.path.exists(main_path):
        raise FileNotFoundError(f"Entry point {main_path} not found.")

    with open(main_path, 'rb') as f:
        main_bytes = f.read().replace(b'\r\n', b'\n')

    imports = SIDE_EFFECT_IMPORT_RE.findall(main_bytes)
    order = [m.decode('utf-8') for m in imports]

    # Verify no orphaned js files in src/ (except main.js)
    all_src_files = set()
    for root, _, files in os.walk(src_dir):
        for file in files:
            if file.endswith('.js') and file != 'main.js':
                rel = './' + os.path.relpath(os.path.join(root, file), src_dir).replace('\\', '/')
                all_src_files.add(rel)

    missing = set(order) - all_src_files
    if missing:
        raise ValueError(f"Modules referenced in main.js do not exist: {missing}")

    orphans = all_src_files - set(order)
    if orphans:
        raise ValueError(f"Orphaned modules found in src/ not listed in main.js: {orphans}")

    parts = []
    for rel in order:
        mod_path = os.path.normpath(os.path.join(src_dir, rel))
        with open(mod_path, 'rb') as f:
            code = f.read().replace(b'\r\n', b'\n')

        code = strip_import_header(code)
        code = EXPORT_PREFIX_RE.sub(b'', code)

        if banners:
            banner_name = rel[2:].encode('utf-8')
            parts.append(b'// ' + b'--' * 10 + b' src/' + banner_name + b' ' + b'--' * 10 + b'\n')
        parts.append(code if code.endswith(b'\n') else code + b'\n')

    return b''.join(parts)

def build(banners=True):
    cwd = os.path.dirname(os.path.abspath(__file__))
    project_dir = os.path.dirname(cwd)
    src_dir = os.path.join(project_dir, 'src')
    dist_dir = os.path.join(project_dir, 'dist')

    template_path = os.path.join(project_dir, 'index_template.html')
    css_path = os.path.join(project_dir, 'index.css')
    bundle_path = os.path.join(dist_dir, 'index.bundle.js')
    output_path = os.path.join(project_dir, 'index.html')

    print("Bundling src/ modules...")
    bundle_bytes = bundle(src_dir, banners=banners)

    os.makedirs(dist_dir, exist_ok=True)
    with open(bundle_path, 'wb') as f:
        f.write(bundle_bytes)

    print("Reading templates and styles...")
    with open(template_path, 'rb') as f:
        template_bytes = f.read().replace(b'\r\n', b'\n')

    with open(css_path, 'rb') as f:
        css_bytes = f.read().replace(b'\r\n', b'\n')

    css_replacement = b'<style>\n' + css_bytes + b'\n</style>'
    js_replacement  = b'<script>\n' + bundle_bytes + b'\n</script>'

    css_pattern_bytes = re.compile(
        rb'<link rel="stylesheet" href="index\.css\?v=[\d\.]+">',
        re.IGNORECASE
    )
    js_pattern_bytes = re.compile(
        rb'<script src="(?:dist/index\.bundle\.js|index\.js)\?v=[\d\.]+"></script>',
        re.IGNORECASE
    )

    print("Performing replacements...")
    modified = css_pattern_bytes.sub(lambda _: css_replacement, template_bytes)
    modified = js_pattern_bytes.sub(lambda _: js_replacement, modified)

    print(f"Writing output to {output_path}...")
    with open(output_path, 'wb') as f:
        f.write(modified)

    nojekyll_path = os.path.join(project_dir, '.nojekyll')
    if not os.path.exists(nojekyll_path):
        with open(nojekyll_path, 'wb') as f:
            f.write(b'# Disable Jekyll on GitHub Pages\n')

    size_kb = len(modified) // 1024
    print(f"Build complete! ({size_kb} KB)")

if __name__ == '__main__':
    if len(sys.argv) > 2 and sys.argv[1] == '--verify-identical':
        ref_file = sys.argv[2]
        cwd = os.path.dirname(os.path.abspath(__file__))
        project_dir = os.path.dirname(cwd)
        src_dir = os.path.join(project_dir, 'src')
        bundled = bundle(src_dir, banners=False)
        with open(ref_file, 'rb') as f:
            ref_bytes = f.read().replace(b'\r\n', b'\n')
        if bundled == ref_bytes:
            print("VERIFICATION SUCCESS: Bundled output is byte-identical to reference file!")
            sys.exit(0)
        else:
            print(f"VERIFICATION FAILED: Length bundled={len(bundled)}, ref={len(ref_bytes)}")
            sys.exit(1)
    else:
        build()
