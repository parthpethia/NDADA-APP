import React, { useEffect, useRef } from 'react';
import { View, Text, Image, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
  runOnJS,
  Easing,
} from 'react-native-reanimated';

interface SplashScreenProps {
  onFinish: () => void;
}

export function SplashScreen({ onFinish }: SplashScreenProps) {
  const { width, height } = useWindowDimensions();
  const isMountedRef = useRef(true);
  const opacity = useSharedValue(0);
  const logoScale = useSharedValue(0.7);
  const textOpacity = useSharedValue(0);
  const textTranslateY = useSharedValue(15);

  useEffect(() => {
    isMountedRef.current = true;
    // Fade in the whole screen
    opacity.value = withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) });

    // Scale up the logo smoothly
    logoScale.value = withTiming(1, { duration: 600, easing: Easing.out(Easing.back(1.2)) });

    // Fade in the text slightly after logo
    textOpacity.value = withDelay(300, withTiming(1, { duration: 400 }));
    textTranslateY.value = withDelay(300, withTiming(0, { duration: 400, easing: Easing.out(Easing.cubic) }));

    const handleFinish = () => {
      if (isMountedRef.current) {
        onFinish();
      }
    };

    // After showing for ~1.5s total, fade everything out and call onFinish
    const timeout = setTimeout(() => {
      opacity.value = withTiming(0, { duration: 400, easing: Easing.in(Easing.cubic) }, () => {
        runOnJS(handleFinish)();
      });
    }, 1500);

    return () => {
      isMountedRef.current = false;
      clearTimeout(timeout);
    };
  }, [onFinish]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const logoStyle = useAnimatedStyle(() => ({
    transform: [{ scale: logoScale.value }],
  }));

  const textStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
    transform: [{ translateY: textTranslateY.value }],
  }));

  return (
    <Animated.View style={[styles.container, containerStyle]}>
      {/* Background gradient effect using layered views */}
      <View style={[styles.bgOverlayTop, { height: height * 0.45, borderBottomLeftRadius: width, borderBottomRightRadius: width }]} />
      <View style={[styles.bgOverlayBottom, { height: height * 0.15 }]} />

      <View style={styles.content}>
        <Animated.View style={[styles.logoContainer, logoStyle]}>
          <View style={styles.logoGlow} />
          <Image
            source={require('@/assets/logo-ndada.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </Animated.View>

        <Animated.View style={[styles.textContainer, textStyle]}>
          <Text style={styles.title}>NAGPUR DISTRICT</Text>
          <Text style={styles.title}>AGRO DEALERS ASSOCIATION</Text>
        </Animated.View>

        <Animated.View style={[styles.divider, textStyle]} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0c4a1e',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  bgOverlayTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  bgOverlayBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  logoGlow: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
  },
  logo: {
    width: 150,
    height: 150,
  },
  textContainer: {
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 2.5,
    textAlign: 'center',
    lineHeight: 28,
  },
  divider: {
    width: 60,
    height: 3,
    backgroundColor: '#22c55e',
    borderRadius: 2,
    marginTop: 16,
  },
});
