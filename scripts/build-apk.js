const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const androidDir = path.join(projectRoot, 'android');
const userHome = process.env.USERPROFILE || 'C:\\Users\\Atul';

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

// Clean system temp metro cache to prevent ENOTEMPTY rmdir errors on Windows
const tempMetroCache = path.join(process.env.TEMP || 'C:\\Users\\Atul\\AppData\\Local\\Temp', 'metro-cache');
if (fs.existsSync(tempMetroCache)) {
  console.log(`Cleaning temp metro cache: ${tempMetroCache}`);
  try {
    fs.rmSync(tempMetroCache, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch (e) {
    console.warn(`Warning: Could not clear temp metro cache: ${e.message}`);
  }
}

console.log('=== [1/2] Stopping lingering daemons and setting build environment ===');

if (process.platform === 'win32') {
  try { spawnSync('taskkill', ['/F', '/IM', 'java.exe'], { stdio: 'ignore' }); } catch (e) {}
  try { spawnSync('powershell', ['-Command', 'Start-Sleep -Seconds 2'], { stdio: 'ignore' }); } catch (e) {}
}

const lockFilesToClean = [
  path.join(projectRoot, '.gradle-user-home', 'caches', 'journal-1', 'journal-1.lock'),
  path.join(androidDir, '.gradle', 'noVersion', 'userFolderStat', 'userFolderStat.lock')
];

lockFilesToClean.forEach((f) => {
  if (fs.existsSync(f)) {
    try { fs.rmSync(f, { force: true }); } catch (e) {}
  }
});


process.env.GRADLE_USER_HOME = 'D:\\.gh';
process.env.METRO_CACHE_DIR = path.join(projectRoot, '.metro-cache');
process.env.NODE_ENV = 'production';
process.env.NODE_OPTIONS = '--max-old-space-size=2048';
process.env.CMAKE_BUILD_PARALLEL_LEVEL = '1';
process.env.MAKEFLAGS = '-j1';

console.log('=== [1/2] Purging stale .cxx Ninja build caches across all native modules ===');

function deleteCxxDirs(dir) {
  if (!fs.existsSync(dir)) return;
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          if (file === '.cxx') {
            console.log(`Deleting C++ build cache: ${fullPath}`);
            try { fs.rmSync(fullPath, { recursive: true, force: true }); } catch (e) {}
          } else if (file !== '.git') {
            deleteCxxDirs(fullPath);
          }
        }
      } catch (e) {}
    }
  } catch (e) {}
}

deleteCxxDirs(androidDir);
deleteCxxDirs(path.join(projectRoot, 'node_modules'));


const debugMode = process.argv.includes('--debug');
const buildType = debugMode ? 'Debug' : 'Release';
console.log(`=== [2/2] Building ${buildType} Android APK ===`);

const sourcemapDir = path.join(androidDir, 'app', 'build', 'intermediates', 'sourcemaps', 'react', debugMode ? 'debug' : 'release');
const assetsDir = path.join(androidDir, 'app', 'build', 'generated', 'assets', 'react', debugMode ? 'debug' : 'release');
fs.mkdirSync(sourcemapDir, { recursive: true });
fs.mkdirSync(assetsDir, { recursive: true });

const gradleTask = debugMode ? 'assembleDebug' : 'assembleRelease';

const res = spawnSync(
  process.platform === 'win32' ? 'gradlew.bat' : './gradlew',
  [
    gradleTask,
    '--no-daemon',
    '--max-workers=2'
  ],
  {
    cwd: androidDir,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env }
  }
);



console.log('Gradle finished with exit code:', res.status);

const relativeApkPath = debugMode 
  ? 'app/build/outputs/apk/debug/app-debug.apk'
  : 'app/build/outputs/apk/release/app-release.apk';
const apkPath = path.join(androidDir, relativeApkPath);

const pkgJsonPath = path.join(projectRoot, 'package.json');
let pkgVersion = '1.4';
if (fs.existsSync(pkgJsonPath)) {
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    if (pkg.version) {
      pkgVersion = pkg.version;
    }
  } catch (e) {}
}

const apkFileName = debugMode ? `app-debug-v${pkgVersion}.apk` : `app-release-v${pkgVersion}.apk`;
const rootApk = path.join(projectRoot, apkFileName);
const downloadsApk = path.join(userHome, 'Downloads', apkFileName);

if (res.status === 0 && fs.existsSync(apkPath)) {
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

  const size = (fs.statSync(apkPath).size / (1024 * 1024)).toFixed(2);
  console.log('===============================================');
  console.log(` SUCCESS: Android APK (${buildType}) built successfully!`);
  console.log(` Source File: ${apkPath}`);
  console.log(` Output File 1 (Project Root): ${rootApk}`);
  console.log(` Output File 2 (Downloads): ${downloadsApk}`);
  console.log(` Size: ${size} MB`);
  console.log('===============================================');
  process.exit(0);
} else {
  console.error('===============================================');
  console.error(` ERROR: Android APK (${buildType}) build failed.`);
  console.error('===============================================');
  process.exit(res.status || 1);
}

