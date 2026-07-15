const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const androidDir = path.join(projectRoot, 'android');

// Redirect Gradle caches to the D: drive to free up C: space and avoid Windows MAX_PATH (260 char) limits
process.env.GRADLE_USER_HOME = 'D:\\.gradle';

// Check if we are running in clean-only mode
const cleanOnly = process.argv.includes('--clean-only');

console.log('=== [1/3] Stopping Gradle daemons to free up RAM ===');
spawnSync(
  process.platform === 'win32' ? 'gradlew.bat' : './gradlew',
  ['--stop'],
  { cwd: androidDir, stdio: 'inherit', shell: true }
);

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
      fs.rmSync(p, { recursive: true, force: true });
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
          fs.rmSync(fullPath, { recursive: true, force: true });
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

console.log('=== [3/3] Building Release Android App Bundle (AAB) ===');
// Limit C++ compiler parallel threads globally to avoid Windows paging file/OOM crashes
process.env.CMAKE_BUILD_PARALLEL_LEVEL = '1';
// Increase Node memory limit to prevent Metro bundler OOM crashes
process.env.NODE_OPTIONS = '--max-old-space-size=4096';

const gradleArgs = [
  'bundleRelease',
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
  console.log('===============================================');
  console.log(' SUCCESS: Android App Bundle built successfully!');
  console.log(' File: android/app/build/outputs/bundle/release/app-release.aab');
  console.log('===============================================');
  process.exit(0);
} else {
  console.error('===============================================');
  console.error(' ERROR: Android App Bundle build failed.');
  console.error('===============================================');
  process.exit(result.status || 1);
}
