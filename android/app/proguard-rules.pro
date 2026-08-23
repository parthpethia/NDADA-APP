# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# react-native-worklets
-keep class com.swmansion.worklets.** { *; }
-dontwarn com.swmansion.worklets.**

# react-native-screens
-keep class com.swmansion.rnscreens.** { *; }
-dontwarn com.swmansion.rnscreens.**

# React Native Core & New Architecture
-keep class com.facebook.react.** { *; }
-keep class com.facebook.soloader.** { *; }
-dontwarn com.facebook.react.**
-keep class com.ndada.app.** { *; }

# React Native Async Storage
-keep class com.reactnativecommunity.asyncstorage.** { *; }
-dontwarn com.reactnativecommunity.asyncstorage.**

# React Native SVG & Gesture Handler
-keep class com.horcrux.svg.** { *; }
-dontwarn com.horcrux.svg.**
-keep class com.swmansion.gesturehandler.** { *; }
-dontwarn com.swmansion.gesturehandler.**

# Hermes JS Engine rules
-keep class com.facebook.hermes.unicode.** { *; }
-keep class com.facebook.jni.HybridData { *; }
-keep class com.facebook.jni.** { *; }

# Expo modules keep rules
-keep class expo.modules.** { *; }
-dontwarn expo.modules.**
-keep class expo.modules.securestore.** { *; }
-keep class expo.modules.filesystem.** { *; }
-keep class expo.modules.documentpicker.** { *; }
-keep class expo.modules.imagemanipulator.** { *; }
-keep class expo.modules.sharing.** { *; }

# Razorpay SDK keep rules
-keep class com.razorpay.** { *; }
-dontwarn com.razorpay.**
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod

# Supabase (OkHttp, WebSockets, Jackson/Gson serialization)
-keep class okhttp3.** { *; }
-dontwarn okhttp3.**
-dontwarn javax.annotation.Nullable
-dontwarn javax.annotation.ParametersAreNonnullByDefault

# Preserve native JNI methods and React Native annotations
-keepclasseswithmembernames class * {
    native <methods>;
}
-keepclassmembers class * {
    @com.facebook.react.uimanager.annotations.ReactProp <fields>;
    @com.facebook.react.uimanager.annotations.ReactPropGroup <fields>;
}

