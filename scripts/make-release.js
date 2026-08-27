const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const androidDir = path.join(projectRoot, 'android');
const userHome = process.env.USERPROFILE || 'C:\\Users\\Atul';

// Ensure Gradle and CLI use Android Studio's bundled JDK 21
const jbrHome = 'C:\\Program Files\\Android\\Android Studio\\jbr';
if (fs.existsSync(jbrHome)) {
  process.env.JAVA_HOME = jbrHome;
  process.env.PATH = `${path.join(jbrHome, 'bin')}${path.delimiter}${process.env.PATH}`;
}

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

console.log('=== [1/2] Purging stale C++ CMake build caches (.cxx) to ensure clean native compilation ===');
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

console.log('=== [2/2] Building Signed Release Android App Bundle (AAB) ===');

if (!process.env.GRADLE_USER_HOME) {
  process.env.GRADLE_USER_HOME = path.join(projectRoot, '.gradle-user-home');
}
process.env.METRO_CACHE_DIR = path.join(projectRoot, '.metro-cache');
process.env.NODE_ENV = 'production';
process.env.NODE_OPTIONS = '--max-old-space-size=4096';

if (process.platform === 'win32') {
  try { spawnSync('taskkill', ['/F', '/IM', 'java.exe'], { stdio: 'ignore' }); } catch (e) {}
}

const sourcemapDir = path.join(androidDir, 'app', 'build', 'intermediates', 'sourcemaps', 'react', 'release');
const assetsDir = path.join(androidDir, 'app', 'build', 'generated', 'assets', 'react', 'release');
fs.mkdirSync(sourcemapDir, { recursive: true });
fs.mkdirSync(assetsDir, { recursive: true });

const res = spawnSync(process.platform === 'win32' ? 'gradlew.bat' : './gradlew', ['clean', 'bundleRelease', '--stacktrace'], {
  cwd: androidDir,
  stdio: 'inherit',
  shell: true,
  env: { ...process.env }
});

console.log('Gradle finished with exit code:', res.status);

function findAabFile(dir) {
  if (!fs.existsSync(dir)) return null;
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          if (file !== '.cxx' && file !== '.gradle') {
            const found = findAabFile(fullPath);
            if (found) return found;
          }
        } else if (file.endsWith('.aab')) {
          return fullPath;
        }
      } catch (e) {}
    }
  } catch (e) {}
  return null;
}

const defaultAab = path.join(androidDir, 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab');
const foundAab = fs.existsSync(defaultAab) ? defaultAab : findAabFile(path.join(androidDir, 'app', 'build'));

const pkgJsonPath = path.join(projectRoot, 'package.json');
let pkgVersion = '1.5.0';
if (fs.existsSync(pkgJsonPath)) {
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    if (pkg.version) {
      pkgVersion = pkg.version;
    }
  } catch (e) {}
}

const rootAab = path.join(projectRoot, `app-release-v${pkgVersion}.aab`);
const downloadsAab = path.join(userHome, 'Downloads', `app-release-v${pkgVersion}.aab`);

if (res.status === 0 && foundAab && fs.existsSync(foundAab)) {
  fs.copyFileSync(foundAab, rootAab);
  try { fs.copyFileSync(foundAab, downloadsAab); } catch (e) {}
  
  const size = (fs.statSync(rootAab).size / (1024 * 1024)).toFixed(2);
  console.log('===============================================');
  console.log(' SUCCESS: Signed AAB created successfully!');
  console.log(' Source file:', foundAab);
  console.log(' Output file 1 (Project Root):', rootAab);
  console.log(' Output file 2 (Downloads):', downloadsAab);
  console.log(` Size: ${size} MB`);
  console.log('===============================================');
  process.exit(0);
} else {
  console.error('ERROR: AAB file not generated or Gradle build failed.');
  process.exit(res.status || 1);
}
