const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const androidDir = path.join(projectRoot, 'android');
const userHome = process.env.USERPROFILE || 'C:\\Users\\Atul';

console.log('=== [1/2] Cleaning stale C++ CMake build caches (.cxx) ===');
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
          } else if (file !== 'node_modules' && file !== '.git') {
            deleteCxxDirs(fullPath);
          }
        }
      } catch (e) {}
    }
  } catch (e) {}
}

deleteCxxDirs(androidDir);
deleteCxxDirs(path.join(projectRoot, 'node_modules', 'react-native-reanimated'));
deleteCxxDirs(path.join(projectRoot, 'node_modules', 'react-native-worklets'));
deleteCxxDirs(path.join(projectRoot, 'node_modules', 'react-native-screens'));
deleteCxxDirs(path.join(projectRoot, 'node_modules', 'react-native-gesture-handler'));

console.log('=== [2/2] Building Signed Release Android App Bundle (AAB) ===');

process.env.GRADLE_USER_HOME = path.join(projectRoot, '.gradle-user-home');
process.env.NODE_ENV = 'production';
process.env.NODE_OPTIONS = '--max-old-space-size=4096';
process.env.CMAKE_BUILD_PARALLEL_LEVEL = '1';

const sourcemapDir = path.join(androidDir, 'app', 'build', 'intermediates', 'sourcemaps', 'react', 'release');
const assetsDir = path.join(androidDir, 'app', 'build', 'generated', 'assets', 'react', 'release');
fs.mkdirSync(sourcemapDir, { recursive: true });
fs.mkdirSync(assetsDir, { recursive: true });

const res = spawnSync(process.platform === 'win32' ? 'gradlew.bat' : './gradlew', ['bundleRelease', '--no-daemon'], {
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

const rootAab = path.join(projectRoot, 'app-release-v1.1.aab');
const downloadsAab = path.join(userHome, 'Downloads', 'app-release-v1.1.aab');

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
