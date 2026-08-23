/**
 * Validates that a built APK is a standalone release artifact (embedded JS bundle, not debuggable).
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BUNDLE_PATH = 'assets/index.android.bundle';
const MIN_BUNDLE_BYTES = 500_000;

function findAapt() {
  const sdkRoot = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (!sdkRoot || !fs.existsSync(sdkRoot)) return null;
  const buildToolsDir = path.join(sdkRoot, 'build-tools');
  if (!fs.existsSync(buildToolsDir)) return null;
  const versions = fs
    .readdirSync(buildToolsDir)
    .filter((name) => fs.statSync(path.join(buildToolsDir, name)).isDirectory())
    .sort()
    .reverse();
  for (const ver of versions) {
    const candidate =
      process.platform === 'win32'
        ? path.join(buildToolsDir, ver, 'aapt.exe')
        : path.join(buildToolsDir, ver, 'aapt');
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function readZipEntry(apkPath, entryName) {
  const buf = fs.readFileSync(apkPath);
  let offset = 0;
  while (offset < buf.length - 30) {
    const sig = buf.readUInt32LE(offset);
    if (sig !== 0x04034b50) break;
    const compMethod = buf.readUInt16LE(offset + 8);
    const compSize = buf.readUInt32LE(offset + 18);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const name = buf.toString('utf8', offset + 30, offset + 30 + nameLen);
    const dataStart = offset + 30 + nameLen + extraLen;
    if (name === entryName) {
      const compressed = buf.subarray(dataStart, dataStart + compSize);
      if (compMethod === 0) return compressed;
      if (compMethod === 8) {
        const zlib = require('zlib');
        return zlib.inflateRawSync(compressed);
      }
      throw new Error(`Unsupported ZIP compression method ${compMethod} for ${entryName}`);
    }
    offset = dataStart + compSize;
  }
  return null;
}

/**
 * @param {string} apkPath
 * @param {{ expectRelease?: boolean }} options
 * @returns {{ ok: boolean, errors: string[], warnings: string[] }}
 */
function verifyApk(apkPath, options = {}) {
  const expectRelease = options.expectRelease !== false;
  const errors = [];
  const warnings = [];

  if (!fs.existsSync(apkPath)) {
    return { ok: false, errors: [`APK not found: ${apkPath}`], warnings };
  }

  let bundle;
  try {
    bundle = readZipEntry(apkPath, BUNDLE_PATH);
  } catch (e) {
    errors.push(`Failed to read ${BUNDLE_PATH}: ${e.message}`);
    bundle = null;
  }

  if (!bundle || bundle.length < MIN_BUNDLE_BYTES) {
    errors.push(
      `Missing or too small embedded JS bundle (${BUNDLE_PATH}). ` +
        'Standalone APKs must include the Metro release bundle. ' +
        'If you built a debug APK, run Metro with `npx expo start` or use `npm run build:apk` for release.'
    );
  }

  const aapt = findAapt();
  if (aapt) {
    const res = spawnSync(aapt, ['dump', 'badging', apkPath], { encoding: 'utf8' });
    const out = `${res.stdout || ''}${res.stderr || ''}`;
    if (/application-debuggable\s*:\s*['"]true['"]/i.test(out)) {
      const msg =
        'APK is debuggable. It will try to load JavaScript from the Metro development server ' +
        '("Could not connect to development server"). Use `npm run build:apk` (release), not `build:apk-debug` or `expo run:android`, for phone installs without a PC.';
      if (expectRelease) errors.push(msg);
      else warnings.push(msg);
    }
  } else {
    warnings.push('aapt not found (set ANDROID_HOME); skipped debuggable check.');
  }

  return { ok: errors.length === 0, errors, warnings };
}

module.exports = { verifyApk, BUNDLE_PATH };

if (require.main === module) {
  const apkPath = process.argv[2];
  if (!apkPath) {
    console.error('Usage: node scripts/verify-apk.js <path-to.apk>');
    process.exit(1);
  }
  const result = verifyApk(apkPath, { expectRelease: !process.argv.includes('--allow-debug') });
  result.warnings.forEach((w) => console.warn('WARN:', w));
  if (result.ok) {
    console.log('OK: APK contains embedded JS bundle and passes release checks.');
    process.exit(0);
  }
  result.errors.forEach((e) => console.error('ERROR:', e));
  process.exit(1);
}
