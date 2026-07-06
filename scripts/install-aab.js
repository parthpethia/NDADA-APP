const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const bundletoolJar = path.join(projectRoot, '.tmp', 'bundletool.jar');
const aabPath = path.join(projectRoot, 'android', 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab');
const apksPath = path.join(projectRoot, 'android', 'app', 'build', 'outputs', 'bundle', 'release', 'app.apks');
const keystorePath = path.join(projectRoot, 'android', 'app', 'debug.keystore');

console.log('=== Step 1: Checking pre-requisites ===');

if (!fs.existsSync(aabPath)) {
  console.error(`Error: AAB file not found at: ${aabPath}`);
  console.error('Please build the AAB first by running: npm run build:android');
  process.exit(1);
}

if (!fs.existsSync(bundletoolJar)) {
  console.error(`Error: bundletool.jar not found at: ${bundletoolJar}`);
  process.exit(1);
}

// Check if device is connected
const adbDevices = spawnSync('adb', ['devices'], { stdio: 'pipe', encoding: 'utf-8' });
console.log(adbDevices.stdout);
const devices = adbDevices.stdout.trim().split('\n').slice(1);
const activeDevices = devices.filter(line => line.includes('\tdevice'));

if (activeDevices.length === 0) {
  console.warn('⚠️ WARNING: No active Android devices or emulators detected via ADB.');
  console.warn('Please connect your phone, enable USB Debugging, and authorize the connection.');
  console.warn('Press Ctrl+C to exit, or connect your device now and press Enter to retry checking...');
  // Pause to let user connect
  fs.readSync(0, Buffer.alloc(1), 0, 1, null);
}

// Clean up existing .apks file if present
if (fs.existsSync(apksPath)) {
  console.log('Cleaning up old APKs archive...');
  fs.unlinkSync(apksPath);
}

console.log('\n=== Step 2: Generating signed APKs from AAB using bundletool ===');
const buildApksArgs = [
  '-jar', bundletoolJar,
  'build-apks',
  `--bundle=${aabPath}`,
  `--output=${apksPath}`,
  `--ks=${keystorePath}`,
  '--ks-pass=pass:android',
  '--ks-key-alias=androiddebugkey',
  '--key-pass=pass:android',
  '--aapt2=C:\\Users\\Atul\\AppData\\Local\\Android\\Sdk\\build-tools\\36.0.0\\aapt2.exe' // use system aapt2
];

const buildResult = spawnSync('java', buildApksArgs, { cwd: projectRoot, stdio: 'inherit' });

if (buildResult.status !== 0) {
  console.error('Error: Failed to generate APKs from AAB.');
  process.exit(1);
}

console.log('\n=== Step 3: Installing APKs to your connected phone ===');
const installResult = spawnSync('java', [
  '-jar', bundletoolJar,
  'install-apks',
  `--apks=${apksPath}`
], { cwd: projectRoot, stdio: 'inherit' });

if (installResult.status === 0) {
  console.log('\n===============================================');
  console.log(' 🎉 SUCCESS: App installed on your phone successfully!');
  console.log('===============================================');
} else {
  console.error('\nError: Installation failed. Please ensure your device is unlocked and authorized.');
}
