const fs = require('fs');
const path = require('path');

// Dynamically resolve and parse apps/backend/.env
const dotenvPath = path.resolve(__dirname, '../../../../apps/backend/.env');
let bypassSecret = '';

if (fs.existsSync(dotenvPath)) {
  const content = fs.readFileSync(dotenvPath, 'utf8');
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('VERCEL_AUTOMATION_BYPASS_SECRET=')) {
      const parts = trimmed.split('=');
      // Extract secret, stripping potential enclosing quotes
      bypassSecret = parts.slice(1).join('=').replace(/^['"]|['"]$/g, '').trim();
      break;
    }
  }
}

if (!bypassSecret) {
  console.error("Error: VERCEL_AUTOMATION_BYPASS_SECRET is missing or empty in apps/backend/.env");
  process.exit(1);
}

const ALLOWED_BASE_URL = 'https://doron-desktop.vercel.app';

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.log("Usage: node vercel-fetch.js <url> <path> [method] [bodyJson]");
    process.exit(1);
  }

  const [baseUrl, apiPath, method = 'GET', bodyJson = ''] = args;

  if (baseUrl.replace(/\/$/, '') !== ALLOWED_BASE_URL) {
    console.error(`Error: URL not allowed. Only ${ALLOWED_BASE_URL} may be fetched (got: ${baseUrl})`);
    process.exit(1);
  }

  // Clean slash boundaries
  const cleanedUrl = `${baseUrl.replace(/\/$/, '')}/${apiPath.replace(/^\//, '')}`;
  
  const headers = {
    'x-vercel-protection-bypass': bypassSecret,
    'Content-Type': 'application/json',
  };

  const options = {
    method,
    headers,
  };

  if (bodyJson) {
    options.body = bodyJson;
  }

  try {
    const res = await fetch(cleanedUrl, options);
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    console.log(JSON.stringify({ status: res.status, headers: Object.fromEntries(res.headers.entries()), data }, null, 2));
  } catch (error) {
    console.error("Request failed:", error.message);
    process.exit(1);
  }
}

main();
