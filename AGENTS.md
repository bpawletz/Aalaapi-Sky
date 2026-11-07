# Repository Guidelines for AI Agents (Jules, etc.)

This document outlines the versioning and documentation rules that must be followed by AI coding agents when implementing changes in this repository.

## 1. Versioning & Changelog Policy
Every time you make a functional change to the codebase (bug fix, new feature, security patch, etc.), you **MUST**:
1. **Bump the Version:** Increment the version number using standard Semantic Versioning (SemVer):
   - **Patch Bump (e.g., 1.10.2 -> 1.10.3):** For bug fixes and security patches.
   - **Minor Bump (e.g., 1.10.2 -> 1.11.0):** For backward-compatible new features.
2. **Update the Changelog with Standardized Grouping & Separation:**
   - **Adopt "Keep a Changelog" Subheadings:** Categorize changes under standard subheadings: `### Added`, `### Changed`, `### Deprecated`, `### Removed`, `### Fixed`, or `### Security`.
   - **Separate Pilot Features from Developer Weeds:** Divide updates within categories into two distinct subsections:
     - `#### Pilot & Operational Features`: Operational changes, flight patterns, hardware support (e.g. AprilTags, RC 2 sync, ADS-B alerts), HUD overlays, and UI workflows.
     - `#### Under the Hood & Technical Details`: Internal implementation details, refactors, helper methods, API endpoints, CSS classes, DOM selectors, and performance optimizations.
   - **Provide Executive Release Summaries for Significant Versions:** For major or feature milestone releases (`X.Y.0`), add a 1–2 sentence high-level summary directly beneath the version header providing immediate context on the core theme.
   - **Streamline Emoji Usage:** Emojis are reserved exclusively for version or category headers (e.g., `### 🚀 Added`, `### 🐛 Fixed`). Do NOT place emojis on individual bullet points to ensure a clean, scannable left margin.
   - **Standard Changelog Entry Template:**
     ```markdown
     ## [X.Y.Z] - YYYY-MM-DD

     [Optional 1-2 sentence executive summary for significant releases]

     ### Added | Changed | Fixed | Removed

     #### Pilot & Operational Features
     - **[Feature Name]**: User-facing summary explaining what pilots can do.
       - Sub-bullet details for controls, options, or behavior.

     #### Under the Hood & Technical Details
     - **[Component Name / File Path]**: Codebase specifics, API endpoints, internal math, DOM IDs, CSS classes.
     ```

## 2. Required Version Locations
When changing the project version, you must update the version tag in the following **six** locations:

1. **`package.json`:**
   - Update the `"version"` field:
     ```json
     "version": "X.Y.Z"
     ```
2. **`CHANGELOG.md`:**
   - Create a new header block at the top of the file using the format:
     ```markdown
     ## [X.Y.Z] - YYYY-MM-DD
     ```
3. **`index.html`:**
   - Update the `<span class="version-tag">Version X.Y.Z</span>` inside the About modal.
   - Update the changelog header `<strong style="color: var(--text-main);">Changelog (vX.Y.Z):</strong>` and append the new version bullet points at the top of the changelog list container.
4. **`index_template.html`:**
   - Update the version-tag `<span>` and the changelog list header/bullets identically to the edits made in `index.html`.
5. **`index_template.html` header badge (5th location):**
   - Update the `<span class="header-version-badge">vX.Y.Z</span>` element on line 72 inside the `<h1>` app title.
   - This is the small version badge shown next to "Aalaapi Sky" in the sidebar header (distinct from the About modal version-tag).
   - Example: `<span class="header-version-badge" ...>v1.26.14</span>`
6. **`android/app/build.gradle.kts` (6th location):**
   - Update `versionCode` (e.g. `versionCode = 12350` for `1.235.0`) and `versionName = "X.Y.Z"`.

## 3. Build & Compilation Step
`index.html` is a single-file application bundle compiled from `index_template.html`, `index.css`, and modular JavaScript files organized in `src/`.
The source JavaScript is split into domain-specific ES modules under `src/` (e.g. `src/core/`, `src/platform/`, `src/state/`, `src/export/`, `src/map/`, `src/patterns/`, `src/3d/`, `src/bridge/`, `src/ui/`), with module load sequencing defined in `src/main.js`.
**Never edit `dist/index.bundle.js` directly**; always make modifications in `src/`.
After making edits to `src/`, `index.css`, or `index_template.html`, you **MUST** run the build script to compile the bundle and `index.html`:
```bash
python scratch/build.py
```
You can also run static AST module graph verification at any time:
```bash
npm run check:modules
```

## 4. Standard Verification & Mandatory Regression Testing (Unit & E2E Tests)
After applying updates, bumping versions, and running the build script, run both the unit and Playwright E2E UI test suites to verify code correctness:
```bash
# Run both unit and E2E tests:
node --test index.test.js index.e2e.test.js
# Or using npm:
npm test
```
- **Mandatory Bug Fix Tests**: Whenever you identify or fix a bug, issue, or edge-case regression (e.g., XML tag validation, NaN values, calculation errors, or UI behaviors), you **MUST** write a dedicated unit test in `index.test.js` or E2E UI test in `index.e2e.test.js` specifically asserting that the issue is prevented from recurring.
- **Unit Tests (`index.test.js`)**: Add unit tests for core logic, calculations, WPML parsing/exporting, schema tags, non-NaN validations, and UI helper functions.
- **E2E UI Tests (`index.e2e.test.js`)**: Add Playwright E2E UI tests for any new interactive features, modals, pattern generators, or editor popup behaviors.

- **Scope of Testing**: Unit and E2E regression testing is mandatory only when making functional, behavioral, or structural changes to the codebase (e.g. edits to `src/`, `index.css`, templates, build scripts, or tests). Pure tracking, administrative, or planning actions—such as filing or commenting on GitHub issues, triaging tasks, or reviewing specifications without editing workspace code—do NOT require running tests or build scripts.

All unit and E2E tests must pass before a functional code change task can be marked complete.

## 5. In-App Intro Guide & Feature Highlights Maintenance
Aalaapi Sky includes an interactive **Intro Guide Hub (`#quickstart-modal`)** with a dedicated **"What's New & Feature Highlights"** tab (`#intro-tab-features` / `#intro-pane-features`).
- Whenever you introduce a major user-facing feature, workflow improvement, or new flight pattern, you **MUST** review and update the feature bullet points in the "What's New" pane inside `index_template.html` (and recompile `index.html`) so that pilots and field operators always see current capabilities.

## 6. Automated Build, Test & Push Workflow
To automate building, verifying tests, committing, and pushing changes to the remote repository, you can use the included convenience scripts:

- **Git Bash / Linux / macOS:**
  ```bash
  # Balanced Default (Runs build.py + check:modules + test:unit locally; Playwright E2E runs in GitHub Actions CI):
  ./push.sh "feat(scope): brief description of changes"

  # Quick Mode (Runs build.py + check:modules only; full unit + E2E runs in GitHub Actions CI):
  ./push.sh "docs(guide): update docs" --quick

  # Full Mode (Runs build.py + check:modules + test:unit + test:e2e + validate:xsd locally):
  ./push.sh "feat(scope): major pattern overhaul" --full
  ```
- **PowerShell / Windows:**
  ```powershell
  # Balanced Default:
  .\push.ps1 "feat(scope): brief description of changes"

  # Quick Mode:
  .\push.ps1 "docs(guide): update docs" --quick

  # Full Mode:
  .\push.ps1 "feat(scope): major pattern overhaul" --full
  ```

### GitHub Actions CI Verification (`.github/workflows/ci-tests.yml`)
The repository executes a dedicated GitHub Actions CI matrix on all branch pushes and pull requests:
- **`unit-and-schema` Job**: Runs single-file compilation (`scratch/build.py`), AST module graph verification (`npm run check:modules`), IRL test synchronization (`npm run irl:check`), full unit & companion test suites (`npm run test:unit`), and strict DJI WPML 1.0.2 XSD schema validation (`npm run validate:xsd`).
- **`e2e-playwright` Job**: Runs headless Chromium Playwright UI tests (`npm run test:e2e`) with automated browser caching.

These scripts automatically build, test according to the selected mode, stage changes (`git add .`), create a git commit, and push to the remote repository.

## 7. Three-Tier Architectural Hierarchy (Global → Layer → Waypoint)
All flight parameters in Aalaapi Sky (including Capture Mode, Turn / Path Type, Heading Mode, Speed, Hover Dwell Time, Camera Actions, and Camera Zoom) MUST follow a strict **Three-Tier Cascading Hierarchy**:
1. **Tier 1: Global Mission Failsafes & Defaults (`#mission-failsafes-section`, Section 3):**
   - Serves as the overarching mission-wide fallback default for all waypoints and layers.
2. **Tier 2: Layer Properties & Advanced Dynamics (`#pattern-settings-section`, Section 2):**
   - Each flight layer maintains its own parameters defaulting to `inherit`.
   - When set to `inherit`, the layer dynamically resolves to Tier 1's Global Default. When explicitly set, the layer overrides the global default for all waypoints belonging to that layer.
3. **Tier 3: Individual Waypoint Overrides (2D Map Popup `#waypoint-popup` & 3D FPV HUD `#fpv-waypoint-editor`):**
   - Every individual waypoint defaults to `inherit`.
   - When set to `inherit`, the waypoint dynamically resolves to Tier 2's Layer Property (which may in turn inherit Tier 1).
   - When explicitly configured on a waypoint, the waypoint override takes highest precedence during WPML placemark compilation and map rendering.

Whenever modifying or adding flight controls, agents **MUST** ensure the setting cleanly propagates through this 3-tier cascade (`Waypoint Override -> Layer Setting -> Global Default`) and does not bypass the layer.

## 8. Data Privacy & Zero-Sensitive-Information Policy for GitHub
Never post or store sensitive, personally identifiable, or real-world operational data in GitHub Issues, Pull Requests, commit messages, or public documentation. Specifically:
1. **No Real Geolocation or Coordinates:** Never include actual flight coordinates, home points, takeoff locations, or client site GPS coordinates. When filing issues, writing test cases, or providing reproduction steps, **always** use generic synthetic dummy coordinates (e.g. `[0.0, 0.0]`, `[37.7749, -122.4194]`, or normalized grid offsets `(0, 0)`).
2. **No Personally Identifiable Information (PII) or Addresses:** Never include personal names, pilot/operator names, client identities, physical street addresses, phone numbers, or email addresses.
3. **No Local Machine Paths or Usernames:** Sanitize file paths. Redact Windows user paths (e.g. replace `C:\Users\<username>\...` with `<workspace>/...` or `~/...`).
4. **No Secrets or Credentials:** Never commit or paste GitHub Personal Access Tokens (PATs), API keys, or credentials into repository files, issue descriptions, or comments. Store credentials exclusively in machine-level or user-level environment variables.

## 9. Mandatory Visual & Video Verification for Features & Issue Fixes
Whenever implementing a new feature or fixing an issue/bug in Aalaapi Sky, the AI agent **MUST** capture visual verification demonstrating the capability in action:
1. **Automated Feature Video Recordings (`record_features.sh` / `record_features.ps1`)**:
   - For UI features, pattern generators, 3D HUD visualizations, or interactive workflows, record a video demonstrating the user flow using Playwright:
     ```bash
     # Linux / macOS / Git Bash:
     ./record_features.sh [feature_name]
     # PowerShell / Windows:
     .\record_features.ps1 [feature_name]
     # Or via npm:
     npm run record:features
     ```
   - Automated video recordings are saved into the `recordings/` directory as `.webm` files.
2. **Git Hygiene & Zero Video Tracking in Git**:
   - All video files (`*.webm`, `*.mp4`, `recordings/`, `videos/`) MUST remain strictly gitignored. Never stage, commit, or push video binaries to the repository.
3. **Strict Default Location & Map Centering Policy**:
   - In accordance with Section 8 (Data Privacy Policy), all recorded videos and screenshots **MUST** exclusively use the app's default rural location (`[41.3215, -88.9950]`, Grand Village of the Illinois / Utica, IL rural countryside; do not use a major city center) or normalized grid offsets `(0, 0)`. Never show real-world client coordinates, home points, or operational flight paths.
   - When tools are used or patterns are generated, ensure the center marker and flight path remain positioned squarely in the center of the map viewport (avoiding Leaflet auto-pan offset toward the bottom).
4. **Walkthrough & Verification Reporting**:
   - Reference the generated visual artifacts or screenshots in your implementation walkthrough and verification reports to prove correct UI behavior.

## 10. Issue Tracking & Auto-Closure Policy
Whenever an AI agent works on a feature request, bug fix, improvement, or task:
1. **Mandatory Duplicate Search & Proactive Issue Association:**
   - **Search Existing Open Issues First:** Before creating a new issue, the agent MUST search existing open issues in `bpawletz/Aalaapi-Sky` using the GitHub MCP `search_issues` tool (e.g. `repo:bpawletz/Aalaapi-Sky is:open is:issue <keywords>`) or `list_issues` (with `state: "open"`) to avoid duplicates.
   - **If a Matching Open Issue Exists (or is provided by user):** The agent links and operates directly on that existing issue number (`#<id>`).
   - **If No Matching Issue Exists:** The agent MUST proactively create a new GitHub issue in `bpawletz/Aalaapi-Sky` before writing code, using the GitHub MCP `create_issue` tool with a descriptive title, structured markdown description, and appropriate labels (e.g. `enhancement`, `bug`, or `refactor`). The agent notes the resulting issue number (`#<id>`) for subsequent tracking.
2. **Auto-Closing Commit Syntax:**
   - Commit messages MUST reference and close the targeted issue using standard GitHub auto-closing keywords (e.g. `fix(scope): brief description (closes #123)` or `feat(scope): brief description (fixes #123)`).
3. **Direct Issue Status Updates & Resolution Summary (including Post-Update IRL Test Plan):**
   - Upon completing and verifying the changes (all unit and E2E tests passing), the agent MUST post a concise resolution comment to the GitHub issue summarizing:
     - The version number containing the fix/feature.
     - Key architectural or logic changes implemented.
     - Verification proof (passing unit/E2E test suites and video recordings).
     - **A structured `### 🚁 Post-Update IRL Field Test Plan` section** containing interactive `- [ ]` checkboxes for field verification of the update (plus the mandatory Legal Non-Guarantee & Variations Disclaimer), generated via `node tools/qa/irl_tracker.js add-update` or `npm run irl:sync`.
   - The agent MUST update the issue state to `closed` (e.g. using the GitHub MCP `update_issue` tool with `state: "closed"`).
4. **Changelog & Documentation Cross-Referencing:**
   - The issue reference MUST be documented in `CHANGELOG.md` under the new version header (e.g. `- **Scope:** description (Closes #123)`).

## 11. Flight Plan Settings & Documentation Synchronization Policy
Whenever adding, modifying, renaming, or deprecating a flight pattern, layer setting, waypoint override, or flight parameter in Aalaapi Sky:
1. **Synchronize In-App Help Hub (`#quickstart-modal`)**:
   - Update the **Settings Matrix & Decision Trees** tab (`#intro-pane-matrix` inside `index_template.html`) so the interactive decision trees, category filters, and settings applicability table reflect the change.
   - Ensure any new parameter has its corresponding `Jump to Setting` data attribute (`data-jump-to="input-id"`) configured to navigate cleanly to the input control in the sidebar.
2. **Synchronize Offline Documentation (`docs/FLIGHT_PLAN_DECISION_TREE_AND_SETTINGS_GUIDE.md`)**:
   - Update the corresponding decision tree diagram (Mermaid flowchart and prose), the settings applicability matrix table, and the recommended parameter value ranges.
3. **Mandatory Test Verification**:
   - The test suite (`index.test.js`) verifies that all patterns registered in `#grid-type` have matching rows in both the in-app settings matrix and `docs/FLIGHT_PLAN_DECISION_TREE_AND_SETTINGS_GUIDE.md`. Agents MUST ensure this test passes before completing any pattern-related task.

## 12. External Resources Attribution, Third-Party Licensing & Trademark Policy
Whenever introducing, updating, or referencing any third-party library, CDN script, font asset, map tile service, external REST/WMS API, or proprietary hardware/vendor brand mark in Aalaapi Sky:
1. **Upfront Licensing & Compatibility Audit**:
   - Verify that any external library, asset, or data feed has a compatible permissive open-source or open-data license (e.g., MIT, BSD, Apache 2.0, SIL OFL, ODbL, CC-BY, or public domain). Never introduce restrictive copyleft licenses (e.g., GPL-3.0) or paywalled APIs without explicit authorization.
2. **Synchronize Repository Credits Documentation (`CREDITS.md`)**:
   - Immediately document the resource in `CREDITS.md` under the appropriate category (`Open Source Software Libraries`, `Geospatial, Aeronautical & Meteorological Data Providers`, or `Cultural Heritage`).
   - Include project name, homepage/repo link, authors/copyright holders, license type, and the upstream copyright notice.
3. **Synchronize In-App About Modal (`#about-modal`)**:
   - If the component is loaded in the client-side browser bundle or affects map rendering, update the **Third-Party Credits & Open-Source Licenses** card deck (`#about-credits-section`) inside `index_template.html` (and recompile `index.html`).
4. **Mandatory Trademark & Non-Guarantee Legal Disclaimers ("The Legalize")**:
   - Whenever referring to manufacturer or third-party brands (e.g., DJI, Google, Esri, OpenStreetMap, Apple, Node-RED, WebGL, Autel, Skydio):
     - Ensure the brand mark is attributed to its respective legal entity (e.g., *SZ DJI Technology Co., Ltd.*, *Google LLC*, *Environmental Systems Research Institute, Inc.*).
     - Explicitly state Aalaapi Sky's independent status and include the non-affiliation / non-endorsement disclaimer in `CREDITS.md`, `README.md`, and `#about-trademarks-section`.
   - **IRL Verification Non-Guarantee & Variations Disclaimer**: Maintain the explicit legal disclaimer in `CREDITS.md`, `#about-trademarks-section`, `#disclaimer-modal`, and `docs/IRL_TEST_PLAN.md` stating that an "IRL Verified" status or passing post-flight log analysis is a historical reference check only and **does NOT constitute a guarantee, warranty, or certification of safe flight** across varying wind/weather, GNSS multipath, geomagnetic, DEM/terrain, obstacle, or OEM firmware conditions.
5. **Tile Layer & API Attribution**:
   - Ensure Leaflet tile layers (`L.tileLayer`, `L.tileLayer.wms`, `L.esri.featureLayer`) in `src/map/MapEngine.js` configure an accurate, compliant `attribution` property citing the upstream provider.
6. **Mandatory Test Verification**:
   - Maintain and run the attribution & trademark test suite in `index.test.js` asserting that `CREDITS.md`, `#about-modal`, and trademark legal notices remain intact.


## 13. SSE-First Architecture Policy for Real-Time APIs & Zero-Polling Mandate
To ensure high responsiveness, minimal loop latency, and zero unnecessary CPU/network overhead, all real-time communication between the Aalaapi Sky client and the Companion Bridge MUST follow an **SSE-First Architecture**:

1. **Mandatory SSE for Real-Time Feeds:**
   - Whenever designing, extending, or consuming APIs for dynamic state—including hardware connectivity (RC 2, RTMP, ADS-B, Remote ID), telemetry, weather, progress indicators, or operational events—agents MUST implement Server-Sent Events (SSE) as the primary transport protocol (e.g., `/api/status/stream`, `/api/airspace/stream`, or the unified multiplexed stream `/api/stream`).
   - For high-frequency bidirectional or binary feeds (such as raw video frames), RFC 6455 WebSockets are used.

2. **Strict Zero-Polling Mandate:**
   - Continuous client-side interval polling loops (e.g., `setInterval(fetch, 2000)`) are **STRICTLY PROHIBITED** when an SSE channel is available or can be extended.
   - Client modules MUST subscribe to the live SSE stream (via `ApiClient.js` or `EventSource`) and react event-driven to state broadcasts.

3. **Role of REST Endpoints:**
   - **REST `GET` Endpoints**: Restricted exclusively to:
     1. Initial one-shot hydration/bootstrap upon page load, view mount, or modal open (to immediately populate UI before the first SSE tick arrives).
     2. Disconnected fallback if the client detects that SSE transport is offline or unsupported.
   - **REST `POST / PUT / DELETE` Endpoints**: Reserved exclusively for discrete user-initiated actions, mutations, and commands (e.g., mission sync, camera settings overrides, log export, cache clearing).

4. **Synchronous Shell/Process Execution Caching:**
   - Server-side helpers that execute synchronous child processes or OS queries (such as `netsh advfirewall`, `iwlist`, or system profilers) MUST cache results with an appropriate Time-To-Live (TTL, typically 30–60 seconds) so that status broadcasts and one-shot API queries not introduce blocking loop lag (p99 latency) or burn CPU.

## 14. Comprehensive Undo & Redo Integration Policy
To safeguard pilots against accidental clicks, erroneous parameter inputs, and lost custom mission geometries, all mission-altering actions in Aalaapi Sky MUST be bidirectionally reversible via the Undo & Redo architecture:

1. **Universal Control Tracking (Sliders, Textboxes, Dropdowns, Toggles):**
   - Every input, slider, textbox, dropdown `<select>`, and toggle checkbox affecting mission geometry, layer dynamics, camera parameters, or global failsafes MUST be registered with `wireUndoPropertyTracking` in `src/ui/EventBindings.js`.
   - Continuous inputs (e.g. range sliders) use debounced staging (`preparePendingPropertySnapshot` on `pointerdown`/`focusin`/`keydown`, committed on `change`), discarding redundant unchanged snapshots.
   - Discrete controls (e.g. dropdown selects, quick-select chips, mouse wheel triggers, checkboxes) utilize the active element baseline fallback (`_undoBaselineValue`) to automatically capture pre-change state on direct `change` events.
   - Descriptive labels MUST be defined in `getControlPropertyLabel` for clean, contextual pilot toasts (e.g. `↩️ Undid: Change Dome Radius`).

2. **Layer State Synchronization Contract (`LayerManager.js`):**
   - Any property stored on a layer object (including pattern-specific parameters such as Dome, SAR, Corridor, Facade, Helix, Photo Sphere, Hyperlapse, Light Art, and Exclusion Zones) MUST be explicitly extracted in `saveActiveLayerFromUi` and populated in `syncUiWithActiveLayer` (setting `el._undoBaselineValue = val`). This guarantees that layer switching and undo/redo snapshots cleanly preserve and restore every parameter.

3. **Discrete Action & Modal Mutation Snapshots:**
   - All non-input UI actions that alter the flight plan—including Adding Layers, Duplicating Layers, Deleting Layers, Reordering Layers, Toggling Layer Visibility, Switching Flight Patterns, Updating Inter-Layer Transitions (`#layer-transitions-modal`), Saving/Reverting Waypoint Overrides (`#waypoint-popup` & `#fpv-waypoint-editor`), and Inserting Waypoints—MUST invoke `pushUndoSnapshot('<Action Name>')` prior to state mutation (guarded by `!isRestoringUndoState`).

4. **Mandatory Undo/Redo Test Verification:**
   - Whenever introducing or modifying flight parameters, pattern generators, or editor dialogs, agents MUST add unit tests in `index.test.js` or E2E tests in `index.e2e.test.js` specifically asserting that modifying the control increments the undo count, `undoLastAction()` restores the previous value, and `redoLastAction()` re-applies the new value.

## 15. Post-Update IRL Field Test Plan Generation, Tracking & Non-Guarantee Policy
Whenever completing a functional update to Aalaapi Sky (new feature, flight pattern generator change, WPML compilation update, or hardware sync modification), the AI agent **MUST** generate and synchronize an **In-Real-Life (IRL) Field Flight Test Plan**:

1. **Generate Post-Update IRL Test Plan & Synchronize Tracker (`tools/qa/irl_tracker.js`):**
   - Run `npm run irl:sync` (or `node tools/qa/irl_tracker.js add-update --version <X.Y.Z> --issue <id> --title "<summary>" --patterns "<pattern-ids>" --steps "<step1>;<step2>"`) prior to building `index.html`.
   - This automatically:
     1. Recomputes SHA-256 function hashes across `src/patterns/PatternGenerators.js`, `src/3d/GeometryBuilder.js`, `src/layers/LayerManager.js`, `src/vision/GcpEngine.js`, and `src/export/WpmlCompiler.js`.
     2. Auto-invalidates any previously `VERIFIED` pattern whose generator code hash changed, flipping its status to `NEEDS_RETEST` (`🧪 Re-Test`).
     3. Appends the versioned post-update IRL test plan to `docs/irl_test_status.json` and regenerates `docs/IRL_TEST_PLAN.md`.
   - If a new flight pattern is added to `#grid-type`, register its canonical definition, recommended rural test parameters (`[41.3215, -88.9950]`), and 6-phase verification steps in `PATTERN_DEFINITIONS` inside `tools/qa/irl_tracker.js`.

2. **Include Interactive IRL Test Checklist in GitHub Issues & Walkthroughs:**
   - Include the generated `### 🚁 Post-Update IRL Field Test Plan` block (with interactive `- [ ]` checkboxes and the `npm run irl:analyze` command) in both the GitHub Issue resolution comment (Section 10) and the implementation walkthrough.

3. **Automated Post-Flight Telemetry Log Verification (`npm run irl:analyze`):**
   - Field test runs can be verified quantitatively by comparing the planned `.wpml`/`.kmz`/`.json` mission against the flown telemetry log (`.csv`, decrypted `.txt`, `.gpx`, or `.geojson`) across all 6 IRL phases (`kmz_import`, `entry_altitude`, `geometry_path`, `heading_gimbal`, `capture_trigger`, `exit_rth`) using:
     ```bash
     npm run irl:analyze -- --pattern <id> --plan <path/to/waylines.wpml> --log <path/to/FlightRecord.csv>
     ```

4. **Mandatory Legal Non-Guarantee & Variations Disclaimer:**
   - Every generated IRL test plan, post-flight telemetry report, and UI status badge tooltip (`#active-layer-irl-badge`) MUST explicitly state that an `IRL Verified` status indicates historical reference verification only and **does NOT constitute a guarantee, warranty, or certification of safe flight**, accounting for variations in wind/weather, GNSS multipath, geomagnetic interference, barometric drift, DEM/map inaccuracies, unmapped obstacles, and OEM firmware updates. The Remote Pilot in Command (RPIC) retains 100% sole responsibility for VLOS and flight safety.

## 16. Mandatory Gimbal Slew & Inertia Auto-Settling Policy (WPML Kinematic Timing)
In DJI Fly and WPML placemark action execution, `<wpml:actionActuatorFunc>gimbalRotate</wpml:actionActuatorFunc>` is asynchronous and non-blocking: the flight controller dispatches the pitch rotation command to the gimbal motor and immediately advances to subsequent actions (`hover`, `takePhoto`) without waiting for physical movement to complete. In addition, aircraft deceleration into the waypoint tolerance envelope consumes approximately 1.0–1.5s of the hover timer before the gimbal motor engages.

To guarantee zero motion blur and prevent camera shutter triggers while the gimbal is still rotating (e.g. from takeoff horizon to survey nadir or during mid-mission transitions), all mission compilers and mathematical calculators MUST strictly enforce the following rules:

1. **Universal Pattern Applicability & Zero Gatekeeping:**
   - Gimbal and inertia auto-settling MUST apply across **all flight patterns** in `stopAndShoot` (and `photo-sphere`) modes (including single grid, double grid, corridor, road-following, orbit, multi-orbit, facade, and freeform).
   - Agents MUST NEVER gate auto-settling behind pattern-specific flags (e.g., `isExtendedSettling`) or restrict it only to clustered points.

2. **Full-Mission Waypoint Coverage (`idx = 0 ... N - 1`):**
   - Auto-settling evaluation MUST include **Waypoint 0 (`idx === 0`)**.
   - At Waypoint 0, the aircraft transits from takeoff with the gimbal at nominal horizon ($0.0^\circ$). If the initial survey pitch tilts downwards (e.g. $0^\circ \to -51^\circ$ or $-90^\circ$), this constitutes an angular pitch slew of $\Delta\text{pitch} = |\text{effectivePitch} - 0.0^\circ|$ and MUST receive the full scaled settling pause.
   - Slew evaluation applies identically across all mid-mission waypoints where $\Delta\text{pitch} = |\text{effectivePitch}_i - \text{effectivePitch}_{i-1}|$.

3. **Angular Slew Magnitude Scaling:**
   - Auto-settling hover dwell MUST scale according to the physical mechanical travel of the gimbal:
     - **Baseline Straight-Line Pause ($\Delta\text{pitch} < 5^\circ$, $\Delta\text{yaw} < 25^\circ$):** $\ge \text{baseSettlingTime}$ (default $2.0\text{s}$).
     - **Moderate Pitch Tilt ($5^\circ \le \Delta\text{pitch} < 35^\circ$):** $\ge \text{pitchSettlingTime}$ (default $3.0\text{s}$).
     - **Medium Pitch Slew ($35^\circ \le \Delta\text{pitch} < 65^\circ$, e.g. $0^\circ \to -51^\circ$):** $\ge \max(\text{pitchSettlingTime}, \text{moderateTurnSettlingTime}, 4.0\text{s})$.
     - **Large / Full-Travel Slew ($\Delta\text{pitch} \ge 65^\circ$, e.g. $\ge 0^\circ \to -90^\circ$ or oblique-to-nadir):** $\ge \max(\text{pitchSettlingTime}, \text{majorTurnSettlingTime}, 5.0\text{s})$.
     - **Yaw Turns:** Apply $\text{moderateTurnSettlingTime}$ ($\ge 25^\circ$, default $4.0\text{s}$) and $\text{majorTurnSettlingTime}$ ($\ge 60^\circ$, default $5.0\text{s}$) universally.

4. **Transparent Waypoint UI & Zero-Hidden Actions:**
   - Waypoint popups (`createWaypointEditorDOM`) and 3D FPV editors MUST display the true compiled effective hover dwell (e.g. `Auto (4.0s)`) rather than raw `0s` when auto-settling is active.
   - The compiled sequential action pipeline (`gimbalRotate` $\to$ `hover` $\to$ `takePhoto`) MUST be surfaced visually via an inline action strip and the interactive Node-RED Flight Action Flow visualizer (`#action-flow-modal`).

5. **Zero-Masking Policy in Telemetry Verification (`IrlVerifier.js`):**
   - `IrlVerifier.js` MUST evaluate gimbal pitch compliance at the actual `CAMERA.isPhoto` shutter trigger sample. Agents are strictly prohibited from masking mid-slew shutter triggers by sampling post-photo resting states.

## 17. Dual-Platform Architecture & Cross-Platform Parity Policy (Desktop / Windows vs. Android Native)
Aalaapi Sky is engineered as a unified dual-platform mission planner and flight execution system running across two distinct target environments:
1. **Desktop / Windows / Browser Environment:** Operates as a web application connected to the local Node.js Companion Bridge daemon (`tools/companion/server.js` on port 8765). Hardware communications (ADS-B 1090 MHz Mode S, RTMP video ingest on port 1935, MTP flight log retrieval) run via server-side child processes, TCP sockets (`adsb_tracker.js`), and REST/SSE endpoints (`/api/airspace/*`, `/api/remote-id/*`, `/api/stream`).
2. **Android Native / DJI RC 2 Mobile Environment:** Operates as an offline-first native Android APK running within Chromium WebView (`file:///android_asset/www/index.html`). Hardware communications run directly via the injected `window.AalaapiAndroid` bridge, native Kotlin TCP socket background services (`AdsbReceiverService.kt`), native USB Host MTP drivers (`AndroidMtpBridge.kt`), and bundled ARM64 decryption binaries (`dji-log-decryptor`).

Whenever implementing, modifying, refactoring, or testing features, AI agents **MUST** adhere to the following cross-platform parity rules:

1. **Mandatory Dual-Pathway Support for Hardware & Network Features:**
   - Any capability interfacing with hardware, external telemetry, or real-world protocols MUST support both execution pathways:
     - **Pathway A (Desktop / Windows):** Check for and interface with the Companion Bridge REST/SSE API (`ApiClient.js`, `fetchAirspaceStatus`, `fetch('/api/...')`).
     - **Pathway B (Android Native):** Check for `window.AalaapiAndroid` or `AndroidNativeBridge` and invoke the corresponding native method before falling back to network HTTP.
   - Agents are strictly prohibited from implementing or modifying a feature in a way that breaks or ignores the other platform.

2. **Cross-Platform Test Verification & Mocking (`index.test.js`):**
   - Unit tests covering telemetry, hardware status, or flight logs MUST assert behavior in both modes:
     - Mode 1: Desktop Browser Mode (`window.AalaapiAndroid = undefined`, mocking Companion Bridge REST/SSE endpoints).
     - Mode 2: Android Native Mode (`window.AalaapiAndroid` defined with mocked native bridge methods).

3. **Android WebView & Chromium Rendering Guardrails:**
   - Client-side DOM, SVG, and CSS modifications must conform strictly to mobile Chromium/Blink and Skia rendering constraints:
     - **SVG Namespaces:** Dynamically injected SVG elements (such as `<defs>`, `<linearGradient>`, and `<stop>`) MUST be created using `document.createElementNS('http://www.w3.org/2000/svg', tag)` rather than raw HTML parsing.
     - **No CSS Filters on Gradient Paths:** Avoid combining CSS `filter: drop-shadow(...)` directly on vector `<path>` or `<polygon>` elements utilizing `fill="url(#id)"`, which causes GPU layer clipping on Android WebView.
     - **Co-located `<defs>`:** Ensure vector paint servers reside within Leaflet's active renderer `<svg>` root rather than disconnected standalone SVG nodes.

4. **Network & Address Resolution Nuances:**
   - **Desktop / Windows Node.js:** Standard `getaddrinfo` (`dns.lookup`) frequently fails to resolve multicast DNS (`.local`) hostnames. The Companion Bridge must provide automatic mDNS discovery fallback (`MdnsService.discoverAdsb()`) to resolve `.local` stations (e.g. `Z83.local`) to their active IPv4 address.
   - **Public Airspace Awareness Feeds:** ADS-B (FAA 1090 MHz) and Remote ID broadcast telemetry are public safety streams for mid-air collision avoidance. Read-only endpoints (`/api/airspace/*`, `/api/adsb/*`, `/api/remote-id/*`, `/api/stream`) MUST remain accessible without requiring pilot authentication.

5. **Platform Abstraction Framework (Common Base + OS Overrides):**
   - Both the Client web app and the Companion Bridge utilize a **Common Base + OS Override Adapter Pattern** rather than scattered inline conditionals:
     - **Client Platform Adapter Hierarchy (`src/platform/`)**:
       - `BasePlatformAdapter.js`: Common base class implementing default Web/Browser + Companion Bridge (`127.0.0.1:8765`) behaviors across all 8 capability domains (File Export, Asset Loading, Geolocation, Voice TTS, Screen Wake Lock, Keychain/Secret Storage, Controller MTP Sync/Logs, and Airspace Sockets).
       - `WindowsDesktopAdapter.js`: Windows/Desktop adapter (`id = 'windows'`).
       - `AndroidPlatformAdapter.js`: Android adapter (`id = 'android'`), routing to `window.AalaapiAndroid` when inside the Kotlin WebView container and falling back to `super` (WebUSB / standard Web APIs) when in mobile Chrome/PWA.
       - `IosPlatformAdapter.js`: iOS adapter (`id = 'ios'`), routing to `window.AalaapiIOS` / `window.webkit.messageHandlers.AalaapiIOS` when inside a native WKWebView container and falling back to the Web Share API (`navigator.share({ files })`) for KMZ export in mobile Safari.
       - `PlatformManager.js`: Singleton resolver exporting `window.Platform` and `window.PlatformManager`. Automatically detects the environment, supports URL query overrides (`?platform=android|ios|windows|web`), and programmatic test overrides (`Platform.usePlatform('<id>')`, `Platform.setAdapter(adapter)`).
     - **Companion Bridge OS Driver Hierarchy (`tools/companion/drivers/`)**:
       - `BaseCompanionDriver.js`: Base class for Node.js Companion Bridge OS operations (ADB discovery, ADB MTP sync, IPv4 resolution, process inspection).
       - `Win32CompanionDriver.js`: Windows overrides (`tasklist`, `wmic`, PowerShell COM WPD MTP automation, `netsh advfirewall`, `dshow` DirectShow FFmpeg video input, `usbipd-win`).
       - `PosixCompanionDriver.js`: Linux/macOS overrides (`ps -ef`, `df -k`, `v4l2`/`avfoundation` FFmpeg video input).
       - `index.js`: Exposes `getCompanionDriver()` and `setCompanionDriver(driver)` singleton resolver.

6. **Strict Zero-Scattered-Conditionals Mandate:**
   - **Client App (`src/`)**: Feature modules (including `ApiClient.js`, `DigitalTwin.js`, `Rc2LogExplorer.js`, `DjiLogDecryptor.js`, `TfrNotam.js`, `Packager.js`, `ThemeManager.js`, `ScreenAwakeManager.js`, and `SidebarManager.js`) **MUST NEVER** invoke `window.AalaapiAndroid` or `window.webkit.messageHandlers` directly via inline conditionals. All platform-dependent capabilities must be declared as methods on `BasePlatformAdapter`, overridden in the corresponding adapter class, and accessed exclusively via `Platform.<method>()`.
   - **Companion Bridge (`tools/companion/`)**: Server modules (including `server.js`, `adsb_tracker.js`, and `video_service.js`) **MUST NEVER** execute raw inline `process.platform === 'win32'` checks for shell commands or OS drivers. All platform-specific child process commands, firewall inquiries, and capture devices must be encapsulated inside `tools/companion/drivers/` and accessed via `getCompanionDriver()`.



## 18. Parallel Feature Development & Automated Git Worktree Lifecycle
When developing multiple features or working across concurrent AI agent sessions, agents **MUST NEVER** share the same physical working directory if both are modifying source files, running builds, or executing git operations. Doing so causes bundle overwrites (`dist/index.bundle.js` / `index.html`), git staging contamination (`git add .`), and version bump collisions.

To safely isolate parallel tasks, agents and pilots use the automated Git Worktree manager:

1. **Spinning Up an Isolated Worktree (`npm run worktree:create`)**:
   ```bash
   npm run worktree:create -- <issue-or-feature-id>
   ```
   - This creates an isolated sibling workspace `../Aalaapi-Sky-wt-<id>` on branch `wt/<id>`.
   - It automatically creates a Windows directory junction (`mklink /J`) or POSIX symlink pointing to the main repo's `node_modules`, enabling instant builds and test execution with zero `npm install` wait time or disk duplication.
   - For subagents within the same conversation, agents may also configure `Workspace: "share"` or `Workspace: "branch"`.

2. **Monitoring Active Worktrees (`npm run worktree:list`)**:
   ```bash
   npm run worktree:list
   ```
   - Inspects all active worktrees, branch names, filesystem locations, and dirty modification counts.

3. **Mandatory Issue Auto-Closure Worktree Cleanup (`npm run worktree:finish`)**:
   - Whenever an issue, PR, or feature task completed in a worktree is merged and ready for closure, the agent **MUST** run the worktree finish command as part of the Section 10 Issue Auto-Closure workflow:
     ```bash
     npm run worktree:finish -- <issue-or-feature-id>
     ```
   - This safely:
     1. Verifies there are no uncommitted or unpushed modifications in the worktree.
     2. Safely unlinks the `node_modules` junction/symlink without modifying or deleting parent repository modules.
     3. Removes the worktree directory (`git worktree remove`).
     4. Deletes the temporary local `wt/<id>` branch (`git branch -d`).
     5. Prunes git tracking references (`git worktree prune`).

## 19. Dual-Platform Verification Policy (Android Touch & Desktop Mouse)
To prevent platform regressions where an Android fix breaks Windows Desktop (or a Windows desktop fix breaks Android touch / RC 2 controllers), all UI modifications in Aalaapi Sky MUST follow these strict principles:

1. **Touch-First, Pointer-Independent Design (Never Hide Essential Actions Behind Hover):**
   - **Hover Is Strictly Cosmetic:** CSS `:hover`, mouseover, and `mouseenter` events may only be used for cosmetic treatments (subtle button glows, mouse cursor styling, non-blocking informational tooltips).
   - **Click/Tap-to-Toggle Mandate:** All interactive toggles, layers menus, popovers, drawers, and modal panels MUST be operable via discrete `click` / tap events. Never require a user to hover to keep a control or dropdown menu expanded.
   - **Clean Event Propagation on Touch Devices:** When handling clicks on floating map controls, buttons, or custom overlays, stop touch event propagation (`touchstart`, `pointerdown`) to Leaflet map containers so mobile gestures do not inadvertently trigger map canvas click handlers (e.g., prematurely dismissing newly expanded menus).

2. **Strict Coordinate Zones & Collision-Proof Geometry:**
   - Map UI controls and floating HUDs MUST be placed into distinct, non-overlapping geometric zones:
     - **Zone 1: Top-Left Control Dock (`y: 12px`, `left: 10px–180px`):** Map Zoom (+/-), Layer Toggle, Undo/Redo.
     - **Zone 2: Top-Right Preset Dock (`y: 12px`, `right: 12px`):** Map Quick-Zoom Presets (`🎯 Plan`, `✈️ Airspace`, Z-badge).
     - **Zone 3: Center Notification Drop Zone (`y: 52px+`, centered):** ADS-B Traffic Alert Banners and Remote-ID Airspace HUDs.
   - High-priority notification banners must never enter the top strip (`y: 12px` to `44px`) so essential navigation controls (`🎯 Plan`, `✈️ Airspace`, Undo/Redo) remain 100% visible and interactive during active traffic advisories.

3. **Mandatory Dual-Platform E2E Verification in Tests (`index.e2e.test.js`):**
   - Any new or modified UI feature, control popup, or navigation button MUST be asserted against both Playwright test contexts:
     1. **Desktop Web Context:** `viewport: 1366x768`, mouse cursor, desktop user agent.
     2. **Mobile / Android Touch Context:** `viewport: 412x915`, `isMobile: true`, `hasTouch: true`, Android/mobile user agent.
   - Assertions must verify that controls open on click/tap, close cleanly, and have zero bounding-box overlaps with active alert banners.

