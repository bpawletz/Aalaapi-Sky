#!/usr/bin/env python3
"""
DJI WPML XML Schema Definition (XSD) Validator
Validates exported DJI Fly / Enterprise KMZ, template.kml, and waylines.wpml files
against strict XSD schemas to prevent drone firmware flight aborts ("Error performing flight").

Supports both official namespaces:
  - http://www.uav.com/wpmz/1.0.2
  - http://www.dji.com/wpmz/1.0.2
"""

import sys
import os
import re
import argparse
import zipfile
import subprocess
import tempfile

try:
    import xmlschema
except ImportError:
    print("Error: 'xmlschema' package is required. Install with: pip install xmlschema", file=sys.stderr)
    sys.exit(1)

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SCHEMAS_DIR = os.path.join(REPO_ROOT, "schemas", "wpml")

def get_namespace_type(xml_content):
    if "http://www.dji.com/wpmz/1.0.2" in xml_content:
        return "dji"
    if "http://www.uav.com/wpmz/1.0.2" in xml_content:
        return "uav"
    return None

def get_drone_enum(xml_content):
    m = re.search(r"<wpml:droneEnumValue>\s*(\d+)\s*</wpml:droneEnumValue>", xml_content)
    if m:
        return int(m.group(1))
    return 68

def get_schema_path(file_type, ns_type, is_consumer=True):
    base = os.path.join(SCHEMAS_DIR, ns_type)
    if file_type == "template":
        return os.path.join(base, "template.xsd")
    elif is_consumer:
        return os.path.join(base, "waylines_consumer.xsd")
    else:
        return os.path.join(base, "waylines_enterprise.xsd")

def validate_xml_string(xml_text, file_type, label=""):
    ns_type = get_namespace_type(xml_text)
    if not ns_type:
        return False, [f"{label}: Missing valid WPML namespace (must be http://www.uav.com/wpmz/1.0.2 or http://www.dji.com/wpmz/1.0.2)"]

    drone_enum = get_drone_enum(xml_text)
    is_consumer = drone_enum in (68, 89)

    schema_file = get_schema_path(file_type, ns_type, is_consumer)
    if not os.path.exists(schema_file):
        return False, [f"{label}: Schema file not found: {schema_file}"]

    try:
        schema = xmlschema.XMLSchema(schema_file)
        schema.validate(xml_text)
        return True, []
    except xmlschema.XMLSchemaValidationError as err:
        errors = []
        errors.append(f"{label} ({'Consumer' if is_consumer else 'Enterprise'}, {ns_type.upper()} namespace): {err.reason}")
        if hasattr(err, "path") and err.path:
            errors.append(f"  Path: {err.path}")
        return False, errors
    except Exception as e:
        return False, [f"{label}: Validation exception: {str(e)}"]

def validate_kmz_file(kmz_path):
    print(f"Auditing KMZ archive: {kmz_path}")
    if not os.path.exists(kmz_path):
        print(f"Error: KMZ file not found: {kmz_path}", file=sys.stderr)
        return False

    all_passed = True
    with zipfile.ZipFile(kmz_path, 'r') as zf:
        namelist = zf.namelist()
        if "wpmz/template.kml" not in namelist:
            print("  FAIL: Missing 'wpmz/template.kml' inside KMZ", file=sys.stderr)
            all_passed = False
        else:
            tpl_text = zf.read("wpmz/template.kml").decode('utf-8')
            passed, errs = validate_xml_string(tpl_text, "template", "wpmz/template.kml")
            if passed:
                print("  PASS: wpmz/template.kml adheres to strict DJI XSD schema")
            else:
                all_passed = False
                for e in errs:
                    print(f"  FAIL: {e}", file=sys.stderr)

        if "wpmz/waylines.wpml" not in namelist:
            print("  FAIL: Missing 'wpmz/waylines.wpml' inside KMZ", file=sys.stderr)
            all_passed = False
        else:
            waylines_text = zf.read("wpmz/waylines.wpml").decode('utf-8')
            passed, errs = validate_xml_string(waylines_text, "waylines", "wpmz/waylines.wpml")
            if passed:
                print("  PASS: wpmz/waylines.wpml adheres to strict DJI XSD schema")
            else:
                all_passed = False
                for e in errs:
                    print(f"  FAIL: {e}", file=sys.stderr)

    return all_passed

def run_matrix_validation():
    print("=" * 70)
    print("DJI WPML Hardware Profile & Pattern Matrix XSD Validation")
    print("=" * 70)

    # Use node helper to generate missions across patterns and hardware profiles
    script = """
const fs = require('fs');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

const dom = new JSDOM(`<!DOCTYPE html><html><body>
  <select id="drone-model"><option value="68">68</option></select>
  <input id="camera-zoom" value="1.0" />
  <input id="global-hover-time" value="0" />
  <input id="grid-type" value="single" />
  <select id="signal-lost-action"><option value="goBack">goBack</option></select>
  <input id="rth-altitude" value="50" />
  <input id="altitude" value="50" />
  <input id="speed" value="4" />
  <input id="gimbal-pitch" value="-60" />
  <select id="finish-action"><option value="goHome">goHome</option></select>
</body></html>`);

global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
global.L = {
  latLng: (lat, lng) => ({ lat, lng }),
  marker: () => ({ getLatLng: () => ({ lat: 0, lng: 0 }) })
};

const bundleCode = fs.readFileSync('./dist/index.bundle.js', 'utf8');
const vm = require('vm');
vm.runInThisContext(bundleCode);

const testMatrix = [];
const patterns = ['single', 'double', 'photo-sphere', 'orbit', 'target-splat', 'freeform'];
const droneModels = [68, 89, 77]; // 68: Mini 4 Pro (Consumer), 89: Air 3 (Consumer), 77: Mavic 3E (Enterprise)

const baseWps = [
  { lat: 41.3215, lon: -88.9950, alt: 50, speed: 4, heading: 90, pitch: -60 },
  { lat: 41.3216, lon: -88.9951, alt: 50, speed: 4, heading: 90, pitch: -60 },
  { lat: 41.3217, lon: -88.9952, alt: 50, speed: 4, heading: 90, pitch: -60 }
];

droneModels.forEach(drone => {
  patterns.forEach(pat => {
    document.getElementById('drone-model').value = String(drone);
    document.getElementById('grid-type').value = pat;

    const tpl = buildTemplateKml('goHome', 4);
    const waylines = buildWaylinesWpml(baseWps, 50, 4, 'followWayline', 'goHome', -60, 'stopAndShoot', 'curved');
    const fixed = validateAndFixWpml(waylines, tpl, { gridType: pat, waypoints: baseWps });

    testMatrix.push({
      drone,
      pattern: pat,
      templateXml: fixed.templateXml || tpl,
      waylinesXml: fixed.wpmlXml
    });
  });
});

const outPath = process.argv.slice(1).find(a => a && a.endsWith('.json')) || process.argv[1] || process.argv[2];
fs.writeFileSync(outPath, JSON.stringify(testMatrix));
"""
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tf:
        out_json_path = tf.name

    try:
        proc = subprocess.run(["node", "-e", script, out_json_path], cwd=REPO_ROOT, capture_output=True, text=True)
        if proc.returncode != 0:
            print(f"Error running matrix generator: {proc.stderr}", file=sys.stderr)
            return False

        import json
        with open(out_json_path, 'r', encoding='utf-8') as f:
            matrix = json.load(f)

        total_tested = 0
        failures = 0

        for item in matrix:
            drone = item["drone"]
            pat = item["pattern"]
            is_consumer = drone in (68, 89)
            drone_name = "DJI Mini 4 Pro (68)" if drone == 68 else ("DJI Air 3 (89)" if drone == 89 else "Mavic 3 Enterprise (77)")

            # Validate template.kml
            t_ok, t_errs = validate_xml_string(item["templateXml"], "template", f"{drone_name} [{pat}] template.kml")
            total_tested += 1
            if not t_ok:
                failures += 1
                for e in t_errs:
                    print(f"  [FAIL] {e}", file=sys.stderr)

            # Validate waylines.wpml
            w_ok, w_errs = validate_xml_string(item["waylinesXml"], "waylines", f"{drone_name} [{pat}] waylines.wpml")
            total_tested += 1
            if not w_ok:
                failures += 1
                for e in w_errs:
                    print(f"  [FAIL] {e}", file=sys.stderr)

            if t_ok and w_ok:
                print(f"  [PASS] {drone_name:<25} | Pattern: {pat:<14} -> 100% XSD Schema Compliant")

        print("=" * 70)
        print(f"Matrix Validation Complete: {total_tested - failures}/{total_tested} checks passed ({failures} failures)")
        print("=" * 70)
        return failures == 0

    finally:
        if os.path.exists(out_json_path):
            os.remove(out_json_path)

def main():
    parser = argparse.ArgumentParser(description="DJI WPML Strict XSD Validator")
    parser.add_argument("--file", "-f", help="Path to KMZ, KML, or WPML file to validate")
    parser.add_argument("--run-matrix", action="store_true", help="Generate and validate mission matrix across drone profiles and patterns")
    args = parser.parse_args()

    if args.run_matrix:
        ok = run_matrix_validation()
        sys.exit(0 if ok else 1)

    if args.file:
        path = args.file
        if path.endswith(".kmz"):
            ok = validate_kmz_file(path)
            sys.exit(0 if ok else 1)
        elif path.endswith(".kml"):
            with open(path, 'r', encoding='utf-8') as f:
                content = f.read()
            ok, errs = validate_xml_string(content, "template", path)
            if ok:
                print(f"PASS: {path} is valid template KML")
                sys.exit(0)
            else:
                for e in errs:
                    print(f"FAIL: {e}", file=sys.stderr)
                sys.exit(1)
        elif path.endswith(".wpml"):
            with open(path, 'r', encoding='utf-8') as f:
                content = f.read()
            ok, errs = validate_xml_string(content, "waylines", path)
            if ok:
                print(f"PASS: {path} is valid waylines WPML")
                sys.exit(0)
            else:
                for e in errs:
                    print(f"FAIL: {e}", file=sys.stderr)
                sys.exit(1)
        else:
            print(f"Unsupported file extension: {path}", file=sys.stderr)
            sys.exit(1)

    # Default action if no args
    parser.print_help()
    sys.exit(0)

if __name__ == "__main__":
    main()
