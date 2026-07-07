#!/usr/bin/env python3
import sys
import os
import subprocess
import re

def run_cmd(args):
    result = subprocess.run(args, capture_output=True, text=True)
    if result.returncode != 0:
        return None, result.stderr.strip()
    return result.stdout.strip(), None

def main():
    # 1. Verify git repository
    git_check, _ = run_cmd(["git", "rev-parse", "--is-inside-work-tree"])
    if git_check != "true":
        print("Error: Not inside a git repository.")
        sys.exit(1)

    # 2. Get current branch name
    branch_name, err = run_cmd(["git", "branch", "--show-current"])
    if not branch_name or err:
        print(f"Error getting current branch: {err}")
        sys.exit(1)

    if branch_name in ["main", "master", "develop"]:
        print(f"Error: You are on default branch '{branch_name}'. Please switch to your feature branch first.")
        sys.exit(1)

    # 3. Parse branch name for CR-XXXX pattern
    # Match pattern starting with cr- followed by digits
    match = re.match(r'^([cC][rR][-_]\d+)(.*)$', branch_name)
    
    if match:
        raw_prefix = match.group(1)
        raw_rest = match.group(2)
        
        # Format ticket number: e.g. cr-1234 or CR_1234 -> [CR-1234]
        ticket_digits = re.search(r'\d+', raw_prefix).group(0)
        formatted_prefix = f"[CR-{ticket_digits}]"
        
        # Clean rest of the branch name
        clean_rest = raw_rest.replace("-", " ").replace("_", " ").strip()
        # Capitalize first letter
        if clean_rest:
            clean_rest = clean_rest[0].upper() + clean_rest[1:]
        else:
            clean_rest = "Update"
            
        pr_title = f"{formatted_prefix} {clean_rest}"
        ticket_id = f"CR-{ticket_digits}"
    else:
        # Fallback if no CR-XXXX prefix
        clean_branch = branch_name.replace("-", " ").replace("_", " ").strip()
        if clean_branch:
            clean_branch = clean_branch[0].upper() + clean_branch[1:]
        pr_title = clean_branch
        ticket_id = None

    print(f"Detected Branch: {branch_name}")
    print(f"Generated PR Title: {pr_title}")

    # 4. Check for staged changes
    staged, _ = run_cmd(["git", "diff", "--cached", "--name-only"])
    if staged:
        print("\nStaged changes detected. Committing staged changes...")
        _, err = run_cmd(["git", "commit", "-m", pr_title])
        if err:
            print(f"Error committing staged files: {err}")
            sys.exit(1)
        print("Committed successfully.")
    
    # Check for unstaged/untracked changes to warn the user
    unstaged, _ = run_cmd(["git", "status", "--porcelain"])
    if unstaged:
        print("\nWarning: You have unstaged or untracked changes in your workspace.")
        print("These will not be included in this Pull Request. If you want to include them, please run 'git add <files>' first.")

    # 5. Push branch to GitHub
    print(f"\nPushing branch '{branch_name}' to remote origin...")
    # Using spawn/interactive style or just running the cmd
    push_out, push_err = run_cmd(["git", "push", "-u", "origin", branch_name])
    # Note: git push sometimes prints to stderr even on success, so we check return status instead
    result = subprocess.run(["git", "push", "-u", "origin", branch_name])
    if result.returncode != 0:
        print("Error: Failed to push branch to GitHub.")
        sys.exit(1)
    print("Pushed successfully.")

    # 6. Read and populate PR Template
    pr_template_path = ".github/pull_request_template.md"
    pr_body = pr_title # Fallback body
    
    if os.path.exists(pr_template_path):
        with open(pr_template_path, "r", encoding="utf-8") as f:
            template_content = f.read()
        
        if ticket_id:
            pr_body = template_content.replace("[CR-XXXX]", formatted_prefix).replace("CR-XXXX", ticket_id)
        else:
            pr_body = template_content.replace("[CR-XXXX]", "").replace("CR-XXXX", "N/A")
            
        print("\nPopulated Pull Request template.")
    else:
        print("\nNo pull_request_template.md found. Using default description.")

    # Write temporary body file
    temp_body_path = ".github/pr_body_temp.md"
    with open(temp_body_path, "w", encoding="utf-8") as f:
        f.write(pr_body)

    # 7. Create Pull Request using gh CLI
    print("\nCreating Pull Request via GitHub CLI (gh)...")
    pr_cmd = [
        "gh", "pr", "create",
        "--title", pr_title,
        "--body-file", temp_body_path
    ]
    
    # We want to run this command interactively or capture it
    pr_result = subprocess.run(pr_cmd, capture_output=True, text=True)
    
    # Cleanup temp file
    if os.path.exists(temp_body_path):
        os.remove(temp_body_path)

    if pr_result.returncode != 0:
        print(f"Error creating PR: {pr_result.stderr.strip()}")
        # Check if gh is installed / authenticated
        if "not authenticated" in pr_result.stderr.lower():
            print("Hint: Run 'gh auth login' to authenticate with GitHub.")
        elif "command not found" in pr_result.stderr.lower() or "not recognized" in pr_result.stderr.lower():
            print("Hint: Please make sure the GitHub CLI (gh) is installed.")
        sys.exit(1)

    print("\n" + "="*50)
    print("Pull Request Created Successfully!")
    print(pr_result.stdout.strip())
    print("="*50)

if __name__ == "__main__":
    main()
