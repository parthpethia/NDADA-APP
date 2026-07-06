#!/bin/bash

# Exit on error
set -e

# Get the directory of this script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Limit CMake parallel compilers globally to 1 thread to avoid NDK memory issues
export CMAKE_BUILD_PARALLEL_LEVEL=1

echo "=== [1/3] Stopping any running Gradle daemons ==="
cd "$SCRIPT_DIR/android"
./gradlew --stop

echo "=== [2/3] Cleaning cache and previous build outputs ==="
cd "$SCRIPT_DIR"
# Remove Expo and bundler caches
rm -rf .expo node_modules/.cache
# Remove CMake cache directories (.cxx) and android build outputs to avoid sync/linker errors
cd "$SCRIPT_DIR/android"
find . -name ".cxx" -type d -exec rm -rf {} +
./gradlew clean --max-workers=1 --no-daemon --no-parallel

echo "=== [3/3] Building Release Android App Bundle (AAB) ==="
# Build with memory-optimized arguments to prevent heap exhaust/clang crash
./gradlew bundleRelease --max-workers=1 --no-daemon --no-parallel

echo "==============================================="
echo " SUCCESS: Android App Bundle built successfully!"
echo " File: android/app/build/outputs/bundle/release/app-release.aab"
echo "==============================================="
