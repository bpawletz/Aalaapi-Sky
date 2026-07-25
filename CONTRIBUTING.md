# Contributing

First off, thank you for considering contributing to this project! It's people like you that make this community such a great place.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the existing issues as you might find out that you don't need to create one. When you are creating a bug report, please include as many details as possible.

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, please provide a clear and descriptive title and a detailed description of the proposed functionality.

### Development & Testing Workflow

1. **Fork & Clone:**
   ```bash
   git clone https://github.com/your-username/Aalaapi-Sky.git
   cd Aalaapi-Sky
   ```

2. **Install Dependencies:**
   ```bash
   npm install
   npx playwright install chromium
   ```

3. **Make Edits & Build Bundle:**
   `index.html` is a single-file application bundle compiled from `index_template.html`, `index.css`, and `index.js`.
   After making edits to source files (`index.js`, `index.css`, `index_template.html`), compile `index.html`:
   ```bash
   python scratch/build.py
   ```

4. **Run Unit & Playwright E2E UI Tests:**
   Verify code correctness by running the full test suite (66+ unit & E2E Playwright tests):
   ```bash
   # Run both unit and Playwright E2E tests:
   npm test

   # Or run specific test suites:
   npm run test:unit
   npm run test:e2e
   ```

5. **Versioning & Push Helper Scripts:**
   When adding functional changes or bug fixes, bump the version (in `package.json`, `CHANGELOG.md`, `index.html`, and `index_template.html`) and use the convenience scripts to automatically build, test, stage, commit, and push:
   - **Linux / macOS / Git Bash:** `./push.sh "feat(scope): description"`
   - **Windows PowerShell:** `.\push.ps1 "feat(scope): description"`

6. **Submit Pull Request:** Open a Pull Request against the `main` branch. Ensure all unit and Playwright E2E tests pass.

## Styleguides

### Git Commit Messages

* Use the present tense ("Add feature" not "Added feature")
* Use the imperative mood ("Move cursor to..." not "Moves cursor to...")
* Limit the first line to 72 characters or less
* Reference issues and pull requests liberally after the first line

## Code of Conduct

Please note that this project is released with a Contributor Code of Conduct. By participating in this project you agree to abide by its terms. See `CODE_OF_CONDUCT.md` for more information.
