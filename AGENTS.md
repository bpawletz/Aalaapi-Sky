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

## 5. Automated Build, Test & Push Workflow
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
