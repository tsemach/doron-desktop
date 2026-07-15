---
name: release
description: Prompts the developer for a version number and automates the version bump, committing, tagging, and pushing of the release to GitHub.
---

# Release Automation Skill

This skill guides you in executing the full release process for the desktop app.

## Workflow

1. **Ask for Version:**
   If the user did not specify a version number, ask them to provide one (e.g., `0.0.18`).
   
2. **Execute Version Bump:**
   Run the version bump command in the workspace root:
   ```bash
   pnpm release:bump <version>
   ```
   *Note: This command automatically updates the version in `tauri.conf.json` and `package.json`, adds them to git, commits with `chore: bump version to v<version>`, and creates the tag `v<version>` locally.*

3. **Push to Remote:**
   Run the git command to push the commit and tag to GitHub to trigger the release runner:
   ```bash
   git push && git push --tags
   ```

4. **Completion Summary:**
   Provide a brief confirmation message showing that the release tag has been pushed and the GitHub Actions build is running.
