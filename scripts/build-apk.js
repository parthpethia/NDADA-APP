const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const androidDir = path.join(projectRoot, 'android');

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
  
  console.log('===============================================');
  console.log(` SUCCESS: Android APK (${buildType}) built successfully!`);
  console.log(` File: ${relativeApkPath}`);
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
