---
name: vercel
description: "Inspect Vercel deployments, check logs, query environment variables, and securely fetch endpoints protected by Vercel deployment protection."
---

# Vercel Skill Instructions

This skill equips the agent to manage Vercel deployments and perform secure HTTP requests to protected deployments.

## Capabilities

### 1. Vercel CLI Commands
You can run the `vercel` command line tool directly from the project root using standard shell commands.
Common tasks:
* **List deployments**: `vercel ls`
* **Inspect a deployment**: `vercel inspect <deployment-url-or-id>`
* **Pull env variables**: `vercel env pull`
* **Fetch logs**: `vercel logs <deployment-url-or-id>`

---

### 2. Fetching Protected Endpoints (`vercel-fetch.js`)
When a deployment is protected by Vercel Deployment Protection (a login wall), standard HTTP requests will fail with a 401/403 or redirect to a Vercel login page.
To bypass this protection, you must use the `vercel-fetch.js` helper script. It reads the bypass secret (`VERCEL_AUTOMATION_BYPASS_SECRET`) from `apps/backend/.env` at runtime and attaches it to the request header `x-vercel-protection-bypass`.

#### Execution Syntax
```bash
node .agents/skills/vercel/scripts/vercel-fetch.js <url> <path> [method] [bodyJson]
```

* **url**: The deployment root URL (e.g. `https://my-app-preview.vercel.app`).
* **path**: The path to fetch (e.g. `/api/health` or `/`).
* **method** *(optional)*: `GET`, `POST`, `PUT`, `DELETE` (defaults to `GET`).
* **bodyJson** *(optional)*: JSON payload for request body.

#### Example
```bash
node .agents/skills/vercel/scripts/vercel-fetch.js https://my-app-preview.vercel.app /api/health
```
