import re
import os

def build():
    cwd = os.path.dirname(os.path.abspath(__file__))
    project_dir = os.path.dirname(cwd)

    template_path = os.path.join(project_dir, 'index_template.html')
    css_path = os.path.join(project_dir, 'index.css')
    js_path = os.path.join(project_dir, 'index.js')
    output_path = os.path.join(project_dir, 'index.html')

    print("Reading files...")
    # Read all files as binary to avoid any line-ending or encoding conversion
    with open(template_path, 'rb') as f:
        template_bytes = f.read()

    with open(css_path, 'rb') as f:
        css_bytes = f.read()

    with open(js_path, 'rb') as f:
        js_bytes = f.read()

    # Normalise all files to LF line endings for consistent splicing
    template_bytes = template_bytes.replace(b'\r\n', b'\n')
    css_bytes      = css_bytes.replace(b'\r\n', b'\n')
    js_bytes       = js_bytes.replace(b'\r\n', b'\n')

    # Build replacement byte strings
    css_replacement = b'<style>\n' + css_bytes + b'\n</style>'
    js_replacement  = b'<script>\n' + js_bytes + b'\n</script>'

    # Use simple byte-level find-and-replace so that the JS/CSS content is
    # never re-interpreted for escape sequences (unlike re.sub with f-strings).
    css_pattern_bytes = re.compile(
        rb'<link rel="stylesheet" href="index\.css\?v=[\d\.]+">',
        re.IGNORECASE
    )
    js_pattern_bytes = re.compile(
        rb'<script src="index\.js\?v=[\d\.]+"></script>',
        re.IGNORECASE
    )

    print("Performing replacements...")
    # Use a lambda so re.sub never processes \n in the replacement as an escape
    modified = css_pattern_bytes.sub(lambda _: css_replacement, template_bytes)
    modified = js_pattern_bytes.sub(lambda _: js_replacement, modified)

    print(f"Writing output to {output_path}...")
    with open(output_path, 'wb') as f:
        f.write(modified)

    # Ensure .nojekyll exists in project root for GitHub Pages (bypasses Jekyll processing)
    nojekyll_path = os.path.join(project_dir, '.nojekyll')
    if not os.path.exists(nojekyll_path):
        with open(nojekyll_path, 'wb') as f:
            f.write(b'# Disable Jekyll on GitHub Pages\n')

    size_kb = len(modified) // 1024
    print(f"Build complete! ({size_kb} KB)")

if __name__ == '__main__':
    build()
