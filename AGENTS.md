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

## 3. Build & Compilation Step
`index.html` is a single-file application bundle compiled from `index_template.html`, `index.css`, and `index.js`.
After making edits to `index.js`, `index.css`, or `index_template.html`, you **MUST** run the build script to compile the `index.html` bundle:
```bash
python scratch/build.py
```

## 4. Standard Verification
After applying updates, bumping versions, and running the build script, run the test suite to verify code correctness:
```bash
node --test index.test.js
```
All tests must pass before the task can be marked complete.
