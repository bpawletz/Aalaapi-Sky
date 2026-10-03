# Repository Guidelines for AI Agents (Jules, etc.)

This document outlines the versioning and documentation rules that must be followed by AI coding agents when implementing changes in this repository.

## 1. Versioning & Changelog Policy
Every time you make a functional change to the codebase (bug fix, new feature, security patch, etc.), you **MUST**:
1. **Bump the Version:** Increment the version number using standard Semantic Versioning (SemVer):
   - **Patch Bump (e.g., 1.10.2 -> 1.10.3):** For bug fixes and security patches.
   - **Minor Bump (e.g., 1.10.2 -> 1.11.0):** For backward-compatible new features.
2. **Update the Changelog:** Add a detailed list of changes under the new version block.

## 2. Required Version Locations
When changing the project version, you must update the version tag in the following **four** locations:

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

## 3. Build & Compilation Step
`index.html` is a single-file application bundle compiled from `index_template.html`, `index.css`, and `index.js`.
After making edits to `index.js`, `index.css`, or `index_template.html`, you **MUST** run the build script to compile the `index.html` bundle:
```bash
python scratch/build.py
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

All unit and E2E tests must pass before the task can be marked complete.

## 5. In-App Intro Guide & Feature Highlights Maintenance
Aalaapi Sky includes an interactive **Intro Guide Hub (`#quickstart-modal`)** with a dedicated **"What's New & Feature Highlights"** tab (`#intro-tab-features` / `#intro-pane-features`).
- Whenever you introduce a major user-facing feature, workflow improvement, or new flight pattern, you **MUST** review and update the feature bullet points in the "What's New" pane inside `index_template.html` (and recompile `index.html`) so that pilots and field operators always see current capabilities.

## 6. Automated Build, Test & Push Workflow
To automate building, verifying unit and E2E tests, committing, and pushing changes to the remote repository, you can use the included convenience scripts:

- **Git Bash / Linux / macOS:**
  ```bash
  ./push.sh "feat(scope): brief description of changes"
  ```
- **PowerShell / Windows:**
  ```powershell
  .\push.ps1 "feat(scope): brief description of changes"
  ```

These scripts automatically run the build step (`python scratch/build.py`), run unit & E2E tests (`node --test index.test.js index.e2e.test.js`), stage changes (`git add .`), create a git commit, and push to `origin/main`.

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
Whenever an AI agent works on an issue, bug report, or feature request that corresponds to an existing GitHub issue:
1. **Auto-Closing Commit Syntax:**
   - Commit messages MUST reference and close the targeted issue using standard GitHub auto-closing keywords (e.g. `fix(scope): brief description (closes #123)` or `feat(scope): brief description (fixes #123)`).
2. **Direct Issue Status Updates & Resolution Summary:**
   - Upon completing and verifying the changes (all unit and E2E tests passing), the agent MUST post a concise resolution comment to the GitHub issue summarizing:
     - The version number containing the fix/feature.
     - Key architectural or logic changes implemented.
     - Verification proof (passing unit/E2E test suites and video recordings).
   - The agent MUST update the issue state to `closed` (e.g. using the GitHub MCP `update_issue` tool with `state: "closed"`).
3. **Changelog & Documentation Cross-Referencing:**
   - The issue reference MUST be documented in `CHANGELOG.md` under the new version header (e.g. `- **Scope:** description (Closes #123)`).
