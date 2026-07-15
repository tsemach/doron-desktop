const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Get version from CLI argument
const versionArg = process.argv[2];
if (!versionArg) {
  console.error("Error: Please provide a version number (e.g. 0.0.17 or v0.0.17)");
  process.exit(1);
}

// Format versions
const cleanVersion = versionArg.startsWith('v') ? versionArg.slice(1) : versionArg;
const taggedVersion = `v${cleanVersion}`;

// Validate basic version format (x.y.z)
const semverRegex = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/;
if (!semverRegex.test(cleanVersion)) {
  console.error(`Error: "${cleanVersion}" is not a valid semver version (e.g. 0.0.17).`);
  process.exit(1);
}

const rootDir = path.resolve(__dirname, '..');

// 1. Update apps/desktop/src-tauri/tauri.conf.json
const tauriConfPath = path.join(rootDir, 'apps/desktop/src-tauri/tauri.conf.json');
if (fs.existsSync(tauriConfPath)) {
  try {
    const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
    tauriConf.version = cleanVersion;
    fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n', 'utf8');
    console.log(`✓ Updated apps/desktop/src-tauri/tauri.conf.json version to "${cleanVersion}"`);
  } catch (err) {
    console.error(`Error updating tauri.conf.json:`, err.message);
    process.exit(1);
  }
} else {
  console.error(`Error: Cannot find tauri.conf.json at ${tauriConfPath}`);
  process.exit(1);
}

// 2. Update apps/desktop/package.json
const desktopPackagePath = path.join(rootDir, 'apps/desktop/package.json');
if (fs.existsSync(desktopPackagePath)) {
  try {
    const pkg = JSON.parse(fs.readFileSync(desktopPackagePath, 'utf8'));
    pkg.version = cleanVersion;
    fs.writeFileSync(desktopPackagePath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
    console.log(`✓ Updated apps/desktop/package.json version to "${cleanVersion}"`);
  } catch (err) {
    console.warn(`Warning updating apps/desktop/package.json:`, err.message);
  }
}

// 3. Commit and tag changes
try {
  console.log(`Staging and committing files for release...`);
  execSync(`git add apps/desktop/src-tauri/tauri.conf.json apps/desktop/package.json`, { stdio: 'inherit', cwd: rootDir });
  execSync(`git commit -m "chore: bump version to ${taggedVersion}"`, { stdio: 'inherit', cwd: rootDir });
  
  console.log(`Creating tag ${taggedVersion}...`);
  execSync(`git tag ${taggedVersion}`, { stdio: 'inherit', cwd: rootDir });
  
  console.log(`\n🎉 Successfully bumped version to ${cleanVersion} and tagged ${taggedVersion}!`);
  console.log(`Next step: Run 'git push && git push --tags' to start deployment.`);
} catch (err) {
  console.error(`Git command failed:`, err.message);
  process.exit(1);
}
