const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const androidDir = path.join(projectRoot, 'android');

// Load .env into process.env if available
const envPath = path.join(projectRoot, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const key = trimmed.substring(0, idx).trim();
      const val = trimmed.substring(idx + 1).trim();
      if (key && !process.env[key]) {
        process.env[key] = val;
      }
    }
  });
}

// Redirect Gradle caches and home files to the D: drive where there is ample free space (15+ GB)
process.env.GRADLE_USER_HOME = path.join(projectRoot, '.gradle-user-home');

// Check if we are running in clean-only or debug mode
const cleanOnly = process.argv.includes('--clean-only');
const debugMode = process.argv.includes('--debug');

console.log('=== [1/3] Stopping Gradle daemons to free up RAM ===');
spawnSync(
  process.platform === 'win32' ? 'gradlew.bat' : './gradlew',
  ['--stop'],
  { cwd: androidDir, stdio: 'inherit', shell: true }
);

// Allow OS to release file handles after stopping Gradle daemons
if (process.platform === 'win32') {
  try {
    spawnSync('powershell', ['-Command', 'Start-Sleep -Seconds 2'], { stdio: 'ignore' });
  } catch (e) {}
}

console.log('=== [2/3] Clearing cache and previous build outputs ===');
const pathsToClean = [
  path.join(projectRoot, '.expo'),
  path.join(projectRoot, 'node_modules', '.cache'),
  path.join(androidDir, 'app', 'build'),
  path.join(androidDir, '.gradle')
];

pathsToClean.forEach((p) => {
  if (fs.existsSync(p)) {
    console.log(`Deleting ${p}...`);
    try {
      fs.rmSync(p, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
    } catch (err) {
      console.warn(`Warning: Could not delete ${p}: ${err.message}`);
    }
  }
});

// Clean up all C++ CMake build caches (.cxx directories)
console.log('Searching and deleting all .cxx directories...');
function deleteCxxDirs(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (file === '.cxx') {
        console.log(`Deleting C++ cache: ${fullPath}...`);
        try {
          fs.rmSync(fullPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
        } catch (err) {
          console.warn(`Warning: Could not delete ${fullPath}: ${err.message}`);
        }
      } else {
        deleteCxxDirs(fullPath);
      }
    }
  }
}
deleteCxxDirs(androidDir);
deleteCxxDirs(path.join(projectRoot, 'node_modules'));

// Run gradle clean
spawnSync(
  process.platform === 'win32' ? 'gradlew.bat' : './gradlew',
  ['clean'],
  { cwd: androidDir, stdio: 'inherit', shell: true }
);

if (cleanOnly) {
  console.log('===============================================');
  console.log(' SUCCESS: Android build environment cleaned!');
  console.log('===============================================');
  process.exit(0);
}

const buildType = debugMode ? 'Debug' : 'Release';
console.log(`=== [3/3] Building ${buildType} Android APK ===`);

// Limit C++ compiler parallel threads globally to avoid Windows paging file/OOM crashes
process.env.CMAKE_BUILD_PARALLEL_LEVEL = '1';
// Increase Node.js heap limit for the Metro bundler to prevent JavaScript heap OOM crash
process.env.NODE_OPTIONS = '--max-old-space-size=4096';

const gradleTask = debugMode ? 'assembleDebug' : 'assembleRelease';

const gradleArgs = [
  gradleTask,
  '--max-workers=1',
  '--no-daemon',
  '--no-parallel'
];

const result = spawnSync(
  process.platform === 'win32' ? 'gradlew.bat' : './gradlew',
  gradleArgs,
  {
    cwd: androidDir,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env }
  }
);

if (result.status === 0) {
  const relativeApkPath = debugMode 
    ? 'android/app/build/outputs/apk/debug/app-debug.apk'
    : 'android/app/build/outputs/apk/release/app-release.apk';
  const apkPath = path.join(projectRoot, relativeApkPath);

  const pkgJsonPath = path.join(projectRoot, 'package.json');
  let pkgVersion = '1.2';
  if (fs.existsSync(pkgJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
      if (pkg.version) {
        const parts = pkg.version.split('.');
        pkgVersion = parts.slice(0, 2).join('.');
      }
    } catch (e) {}
  }

  const userHome = process.env.USERPROFILE || 'C:\\Users\\Atul';
  const apkFileName = debugMode ? `app-debug-v${pkgVersion}.apk` : `app-release-v${pkgVersion}.apk`;
  const rootApk = path.join(projectRoot, apkFileName);
  const downloadsApk = path.join(userHome, 'Downloads', apkFileName);

  if (fs.existsSync(apkPath)) {
    try {
      fs.copyFileSync(apkPath, rootApk);
      console.log(`Copied APK to Project Root: ${rootApk}`);
    } catch (e) {
      console.warn(`Could not copy to root: ${e.message}`);
    }

    try {
      fs.copyFileSync(apkPath, downloadsApk);
      console.log(`Copied APK to Downloads: ${downloadsApk}`);
    } catch (e) {
      console.warn(`Could not copy to Downloads: ${e.message}`);
    }
  }

  console.log('===============================================');
  console.log(` SUCCESS: Android APK (${buildType}) built successfully!`);
  console.log(` Source File: ${relativeApkPath}`);
  if (fs.existsSync(rootApk)) {
    console.log(` Output File 1 (Project Root): ${rootApk}`);
  }
  if (fs.existsSync(downloadsApk)) {
    console.log(` Output File 2 (Downloads): ${downloadsApk}`);
  }
  if (fs.existsSync(apkPath)) {
    const stats = fs.statSync(apkPath);
    console.log(` Size: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`);
  }
  console.log('===============================================');
  process.exit(0);
} else {
  console.error('===============================================');
  console.error(` ERROR: Android APK (${buildType}) build failed.`);
  console.error('===============================================');
  process.exit(result.status || 1);
}
