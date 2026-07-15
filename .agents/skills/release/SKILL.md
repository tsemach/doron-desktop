---
name: release
description: Prompts the developer for a version number and automates the version bump, committing, pushing the release branch, and creating a Pull Request to master.
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
   *Note: If run on master, this command automatically checks out a new branch named `release/v<version>`, updates the version in `tauri.conf.json` and `package.json`, and commits the changes.*

3. **Get Current Branch Name:**
   Determine the active branch name by running:
   ```bash
   git rev-parse --abbrev-ref HEAD
   ```

4. **Push Release Branch:**
   Push the release branch to remote:
   ```bash
   git push -u origin <branch_name>
   ```

5. **Create Pull Request:**
   Open a Pull Request to `master` using the GitHub CLI:
   ```bash
   gh pr create --title "Release v<version>" --body "Automated release version bump to v<version>"
   ```

6. **Completion Summary:**
   Provide a brief confirmation message showing that the Pull Request has been created, and instruct the user to merge it to master to trigger the automated CI/CD release build.
