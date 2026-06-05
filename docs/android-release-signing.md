# Android Release Signing Guide

This guide describes how to configure the release signing configuration for the NDADA Android application.

## 1. Generate a Keystore File
To sign your release APK/AAB, you need to generate a private signing key. You can generate a keystore file using the `keytool` utility:

```bash
keytool -genkey -v -keystore ndada-release.keystore -alias ndada-alias -keyalg RSA -keysize 2048 -validity 10000
```

This command will prompt you for passwords, your name, and organizational details. It generates a file named `ndada-release.keystore` in the current directory.

> [!CAUTION]
> Keep the keystore file secure and backup it in a safe place. If you lose this key, you will not be able to submit updates to the Google Play Store!

---

## 2. Configure Gradle Variables
To avoid committing your private key passwords and paths to git, you must store these properties in your global Gradle configuration file.

1. Navigate to your user home directory:
   - **Windows**: `C:\Users\YOUR_USERNAME\.gradle\`
   - **macOS/Linux**: `~/.gradle/`
2. Create or edit a file named `gradle.properties`.
3. Add the following lines, substituting your actual values:

```properties
MYAPP_RELEASE_STORE_FILE=C:/Users/YOUR_USERNAME/.gradle/ndada-release.keystore
MYAPP_RELEASE_STORE_PASSWORD=your_keystore_password
MYAPP_RELEASE_KEY_ALIAS=ndada-alias
MYAPP_RELEASE_KEY_PASSWORD=your_key_password
```

*(Note: Use forward slashes `/` even on Windows for the file path).*

---

## 3. Graceful Fallback
The build configuration in `android/app/build.gradle` is designed to check for these properties automatically.
- **If the variables are present**: Gradle signs the release build with your production keystore.
- **If the variables are missing**: Gradle falls back to signing with the debug keystore (`debug.keystore`). This ensures that other developers can run builds without needing the production key.
