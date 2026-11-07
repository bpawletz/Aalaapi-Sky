import re
import os
import sys
import json

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
    if banners:
        project_dir = os.path.dirname(src_dir)
        irl_status_path = os.path.join(project_dir, 'docs', 'irl_test_status.json')
        if os.path.exists(irl_status_path):
            try:
                with open(irl_status_path, 'r', encoding='utf-8') as jf:
                    irl_data = json.load(jf)
                code_map = {'VERIFIED': 'V', 'NEEDS_RETEST': 'R', 'FAILED': 'F', 'UNTESTED': 'U'}
                compact_map = {'_issue': irl_data.get('masterIssueUrl', 'https://github.com/bpawletz/Aalaapi-Sky/issues/202')}
                for pid, pinfo in irl_data.get('patterns', {}).items():
                    compact_map[pid] = {
                        's': code_map.get(pinfo.get('status', 'UNTESTED'), 'U'),
                        'v': pinfo.get('lastTestedVersion')
                    }
                compact_json = json.dumps(compact_map, separators=(',', ':')).encode('utf-8')
                parts.append(b'if (typeof window !== "undefined") { window.AALAAPI_IRL_STATUS = ' + compact_json + b'; }\n')
            except Exception as e:
                print(f"Warning: Could not embed IRL status map: {e}")

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
    import time
    for attempt in range(5):
        try:
            with open(output_path, 'wb') as f:
                f.write(modified)
            break
        except OSError as e:
            if attempt == 4: raise
            time.sleep(0.3)

    # Sync assets into Android app assets directory if android/ exists
    android_www = os.path.join(project_dir, 'android', 'app', 'src', 'main', 'assets', 'www')
    if os.path.exists(android_www):
        import shutil
        print(f"Syncing bundle and web assets to {android_www}...")
        for attempt in range(5):
            try:
                with open(os.path.join(android_www, 'index.html'), 'wb') as f:
                    f.write(modified)
                break
            except OSError as e:
                if attempt == 4: raise
                time.sleep(0.3)
        icon_path = os.path.join(project_dir, 'icon.png')
        if os.path.exists(icon_path):
            shutil.copy2(icon_path, os.path.join(android_www, 'icon.png'))

            # Ensure launcher mipmaps are synchronized
            res_dir = os.path.normpath(os.path.join(android_www, '..', '..', 'res'))
            for d in ['mipmap-mdpi', 'mipmap-hdpi', 'mipmap-xhdpi', 'mipmap-xxhdpi', 'mipmap-xxxhdpi']:
                target_dir = os.path.join(res_dir, d)
                os.makedirs(target_dir, exist_ok=True)
                shutil.copy2(icon_path, os.path.join(target_dir, 'ic_launcher.png'))
                shutil.copy2(icon_path, os.path.join(target_dir, 'ic_launcher_round.png'))
                shutil.copy2(icon_path, os.path.join(target_dir, 'ic_launcher_foreground.png'))
        manifest_path = os.path.join(project_dir, 'manifest.json')
        if os.path.exists(manifest_path):
            shutil.copy2(manifest_path, os.path.join(android_www, 'manifest.json'))

        # Ensure static data directory is synced for offline flight planning
        data_src = os.path.join(project_dir, 'data')
        data_dst = os.path.join(android_www, 'data')
        if os.path.exists(data_src):
            os.makedirs(data_dst, exist_ok=True)
            for item in os.listdir(data_src):
                s = os.path.join(data_src, item)
                d = os.path.join(data_dst, item)
                if os.path.isfile(s):
                    shutil.copy2(s, d)

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
