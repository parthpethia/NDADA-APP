#!/bin/bash

# Exit on error
set -e

# Get the directory of this script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "=== [1/2] Preparing build environment ==="
cd "$SCRIPT_DIR/android"

echo "=== [2/2] Building Release Android App Bundle (AAB) ==="
./gradlew bundleRelease

echo "==============================================="
echo " SUCCESS: Android App Bundle built successfully!"
echo " File: android/app/build/outputs/bundle/release/app-release.aab"
echo "==============================================="

