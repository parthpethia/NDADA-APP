import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Animated,
  useWindowDimensions,
  TextInput,
  ActivityIndicator,
  Image,
} from 'react-native';
import Head from 'expo-router/head';
import { Link, router } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { APP_NAME } from '@/constants';
import {
  Lock,
  UserPlus,
  ChevronDown,
  ChevronUp,
  Shield,
  BookOpen,
  Megaphone,
  Scale,
  CheckCircle,
  ArrowRight,
  Eye,
  EyeOff,
} from 'lucide-react-native';

import { ACTIVE_NAVIGATION_STRATEGY } from '@/lib/navigationStrategy';
import { navLog, renderLog } from '@/lib/utils';

export default function LoginScreen() {
  const { signIn, session, profileReady, adminUser } = useAuth();
  const { width: screenWidth } = useWindowDimensions();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loginOpen, setLoginOpen] = useState(true);
  const [contentHeight, setContentHeight] = useState(380);
  const [animFinished, setAnimFinished] = useState(true);

  const renderCountRef = useRef(0);
  renderCountRef.current++;

  renderLog('LoginScreen', renderCountRef.current, {
    session: !!session,
    loading,
    profileReady,
    adminUser: !!adminUser,
  });

  // PRIMARY navigation guard: replaces route once session is active and profile is ready.
  // This is the SOLE navigation mechanism after login — we no longer navigate imperatively
  // in handleLogin() because on Android (async AsyncStorage), the profile/adminUser state
  // isn't resolved yet when signIn() returns, causing the dashboard to show a loading screen.
  const navigatedRef = useRef(false);
  useEffect(() => {
    if (session && profileReady && !navigatedRef.current) {
      navigatedRef.current = true;
      const target = adminUser ? '/admin' : '/(dashboard)';
      navLog('LoginScreen', `State Settled (session=true, profileReady=true) → router.replace(${target})`);
      router.replace(target);
    }
  }, [session, profileReady, adminUser]);

  // Reset navigatedRef when session is cleared (e.g. after logout) so re-login works
  // without requiring the component to unmount and remount.
  useEffect(() => {
    if (!session) {
      navigatedRef.current = false;
    }
  }, [session]);

  // Animation value for dropdown
  const dropdownAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    setAnimFinished(false);
    Animated.timing(dropdownAnim, {
      toValue: loginOpen ? 1 : 0,
      duration: 350,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) setAnimFinished(true);
    });
  }, [loginOpen]);

  const dropdownHeight = dropdownAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, contentHeight],
  });

  const dropdownOpacity = dropdownAnim.interpolate({
    inputRange: [0, 0.3, 1],
    outputRange: [0, 0, 1],
  });

  const handleLogin = async () => {
    const inputStr = email.trim();
    if (!inputStr || !password) {
      setError('Please fill in all fields');
      return;
    }
    setLoading(true);
    setError('');

    try {
      let targetEmail = inputStr;
      if (!inputStr.includes('@')) {
        // Input is a Phone Number (e.g. 9876543210)
        try {
          const { data: lookedUpEmail, error: rpcErr } = await supabase
            .rpc('lookup_email_by_phone', { p_phone: inputStr });

          if (rpcErr) {
            console.warn('Phone number lookup RPC error:', rpcErr);
            const msg = String(rpcErr.message || '').toLowerCase();
            if (
              msg.includes('failed to fetch') ||
              msg.includes('network request failed') ||
              msg.includes('fetcherror') ||
              msg.includes('typeerror') ||
              msg.includes('network error')
            ) {
              setError('Network error while looking up phone number (unable to fetch). Please check your internet connection.');
            } else {
              setError(rpcErr.message || 'Unable to lookup phone number. Please enter your registered email address.');
            }
            setLoading(false);
            return;
          }

          if (lookedUpEmail) {
            targetEmail = lookedUpEmail.trim().toLowerCase();
          } else {
            setError(`No account found matching phone number "${inputStr}". Please check your phone number or enter your registered email.`);
            setLoading(false);
            return;
          }
        } catch (err) {
          console.warn('Phone number lookup failed:', err);
          setError(`Unable to lookup phone number. Please enter your registered email address.`);
          setLoading(false);
          return;
        }
      } else {
        targetEmail = inputStr.toLowerCase();
      }

      navLog('LoginScreen', `signIn() START`, { email: targetEmail });
      const { error: err } = await signIn(targetEmail, password);
      if (err) {
        navLog('LoginScreen', `signIn() ERROR: ${err}`);
        setError(err);
        setLoading(false);
      } else {
        navLog('LoginScreen', 'signIn() SUCCESS → waiting for auth state to settle before navigating');
        // Do NOT navigate imperatively here. On Android, the profile/adminUser state
        // isn't resolved yet because AsyncStorage is async. The reactive useEffect guard
        // above (and the AuthLayout declarative guard) will handle navigation once
        // session + profileReady + adminUser are all resolved.
        // Keep loading=true so the UI shows "Signing in..." until navigation occurs.
      }
    } catch (e: any) {
      navLog('LoginScreen', 'Login submit exception', e);
      setError(e?.message || 'An unexpected error occurred during login. Please try again.');
      setLoading(false);
    } finally {
      // Safety timeout: reset loading spinner only if navigation hasn't happened yet.
      // This prevents the spinner from staying forever if auth state settling takes long,
      // while avoiding a React state-update-on-unmounted-component warning after navigation.
      setTimeout(() => {
        if (!navigatedRef.current) {
          setLoading(false);
        }
      }, 5000);
    }
  };

  const toggleLogin = () => {
    setLoginOpen((prev) => !prev);
    if (!loginOpen) {
      setError('');
    }
  };

  // Responsive layout breakpoints for mobile devices
  const useStackedLayout = screenWidth < 440;
  const serviceCardWidth = Math.min((screenWidth - 44) / 2, 200);
  const benefitItemWidth = Math.min((screenWidth - 48) / 2, 220);

  return (
    <KeyboardAvoidingView
      className="flex-1"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Head>
        <title>NDADA - Nagpur District Agro Dealers Association</title>
        <link rel="icon" type="image/png" href="/assets/logo-ndada.png" />
      </Head>
      <ScrollView
        className="flex-1 bg-white"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ===== HERO SECTION ===== */}
        <View className="bg-primary-950 relative overflow-hidden">
          {/* Decorative gradient overlay */}
          <View
            className="absolute inset-0"
            style={{
              backgroundColor: 'rgba(5, 46, 22, 0.85)',
            }}
          />
          {/* Decorative glow circles */}
          <View
            className="absolute"
            style={{
              width: 300,
              height: 300,
              borderRadius: 150,
              backgroundColor: 'rgba(34, 197, 94, 0.12)',
              top: -80,
              right: -60,
            }}
          />
          <View
            className="absolute"
            style={{
              width: 200,
              height: 200,
              borderRadius: 100,
              backgroundColor: 'rgba(74, 222, 128, 0.08)',
              bottom: -40,
              left: -40,
            }}
          />

          <View className="relative px-5 pt-12 pb-8 items-center">
            {/* Logo */}
            <View className="mb-4 bg-white rounded-full p-1.5 border-2 border-primary-400/30 shadow-lg">
              <Image
                source={require('@/assets/logo-ndada.png')}
                style={{ width: 84, height: 84, borderRadius: 42 }}
                resizeMode="contain"
              />
            </View>

            {/* Badge */}
            <View
              className="mb-5 rounded-full px-4 py-1.5 flex-row items-center gap-2"
              style={{ backgroundColor: 'rgba(34, 197, 94, 0.2)', borderWidth: 1, borderColor: 'rgba(34, 197, 94, 0.3)' }}
            >
              <View className="w-2 h-2 rounded-full bg-primary-400" />
              <Text className="text-primary-300 text-xs font-semibold tracking-wide text-center">
                Nagpur District Agro Dealers Association
              </Text>
            </View>

            {/* Main heading */}
            <Text className="text-white text-2xl sm:text-3xl font-bold text-center mb-3 leading-8 sm:leading-9">
              Serving Agro Dealers.{'\n'}Strengthening Agriculture.
            </Text>

            {/* Subtitle */}
            <Text
              className="text-center text-sm mb-6 leading-5 max-w-md"
              style={{ color: 'rgba(187, 247, 208, 0.8)' }}
            >
              A dedicated platform protecting the rights of agro dealers across Nagpur
              District — your voice, your network, your growth.
            </Text>

            {/* Action Buttons */}
            <View className={`${useStackedLayout ? 'flex-col w-full max-w-xs' : 'flex-row'} items-center justify-center gap-3 mb-2`}>
              <TouchableOpacity
                onPress={toggleLogin}
                className={`flex-row items-center justify-center gap-2 rounded-xl px-5 py-3.5 ${useStackedLayout ? 'w-full' : ''}`}
                style={{
                  backgroundColor: loginOpen ? 'rgba(34, 197, 94, 0.3)' : 'rgba(255,255,255,0.12)',
                  borderWidth: 1,
                  borderColor: loginOpen ? '#22c55e' : 'rgba(255,255,255,0.2)',
                }}
                activeOpacity={0.7}
              >
                <Lock size={16} color="#bbf7d0" />
                <Text className="text-white font-semibold text-sm">Member login</Text>
                {loginOpen ? (
                  <ChevronUp size={16} color="#bbf7d0" />
                ) : (
                  <ChevronDown size={16} color="#bbf7d0" />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => router.push('/(auth)/register')}
                className={`flex-row items-center justify-center gap-2 rounded-xl px-5 py-3.5 bg-primary-600 ${useStackedLayout ? 'w-full' : ''}`}
                activeOpacity={0.8}
              >
                <UserPlus size={16} color="#fff" />
                <Text className="text-white font-semibold text-sm">Register as member</Text>
              </TouchableOpacity>
            </View>

            {/* ===== LOGIN DROPDOWN ===== */}
            <Animated.View
              style={{
                height: (loginOpen && animFinished) ? undefined : dropdownHeight,
                minHeight: loginOpen ? contentHeight : 0,
                opacity: dropdownOpacity,
                overflow: (loginOpen && animFinished) ? 'visible' : 'hidden',
                width: '100%',
                maxWidth: 400,
              }}
            >
              <View
                onLayout={(e) => {
                  const h = e.nativeEvent.layout.height;
                  if (h > 0 && Math.abs(h - contentHeight) > 2) {
                    setContentHeight(h + 12);
                  }
                }}
                className="mt-4 rounded-2xl p-5"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.09)',
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.16)',
                }}
              >
                {/* Error */}
                {error ? (
                  <View className="mb-3.5 rounded-xl p-3 flex-row items-center gap-2" style={{ backgroundColor: 'rgba(239,68,68,0.18)' }}>
                    <AlertCircle size={15} color="#fca5a5" />
                    <Text className="text-xs flex-1 leading-4 font-medium" style={{ color: '#fca5a5' }}>{error}</Text>
                  </View>
                ) : null}

                {/* Email or Phone Number Input */}
                <Text className="mb-1.5 text-xs font-medium" style={{ color: 'rgba(187,247,208,0.85)' }}>
                  Email or Phone Number
                </Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com or 9876543210"
                  placeholderTextColor="rgba(156,163,175,0.6)"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  className="mb-3 rounded-xl px-4 py-3 text-sm"
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.07)',
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.14)',
                    color: '#fff',
                  }}
                />

                {/* Password Input with Eye Toggle */}
                <Text className="mb-1.5 text-xs font-medium" style={{ color: 'rgba(187,247,208,0.85)' }}>
                  Password
                </Text>
                <View className="relative mb-3">
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Enter your password"
                    placeholderTextColor="rgba(156,163,175,0.6)"
                    secureTextEntry={!showPassword}
                    className="rounded-xl px-4 py-3 text-sm pr-11"
                    style={{
                      backgroundColor: 'rgba(255,255,255,0.07)',
                      borderWidth: 1,
                      borderColor: 'rgba(255,255,255,0.14)',
                      color: '#fff',
                    }}
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword((prev) => !prev)}
                    activeOpacity={0.7}
                    className="absolute right-0 top-0 bottom-0 px-3.5 items-center justify-center"
                    accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <EyeOff size={18} color="rgba(187,247,208,0.8)" />
                    ) : (
                      <Eye size={18} color="rgba(187,247,208,0.8)" />
                    )}
                  </TouchableOpacity>
                </View>

                {/* Forgot Password */}
                <View className="items-end mb-4">
                  <Link href="/(auth)/forgot-password">
                    <Text className="text-xs font-medium text-primary-300 underline">Forgot Password?</Text>
                  </Link>
                </View>

                {/* Sign In Button */}
                <TouchableOpacity
                  onPress={handleLogin}
                  disabled={loading}
                  className="rounded-xl py-3.5 items-center justify-center flex-row gap-2 bg-primary-600 active:bg-primary-700"
                  activeOpacity={0.85}
                  style={{ opacity: loading ? 0.6 : 1 }}
                >
                  {loading && <ActivityIndicator size="small" color="#fff" />}
                  <Text className="text-white font-semibold text-sm">
                    {loading ? 'Signing in...' : 'Sign In'}
                  </Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </View>
        </View>

        {/* ===== STATS ROW ===== */}
        <View className="flex-row border-b border-gray-200 bg-gray-50">
          <StatItem value="500+" label="Registered members" />
          <StatItem value="15+" label="Years serving" border />
          <StatItem value="Nagpur" label="District-wide reach" />
        </View>




        {/* ===== SERVICES SECTION ===== */}
        <View className="px-4 mt-7 mb-2">
          <Text className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">
            WHAT WE DO
          </Text>
          <Text className="text-xl font-bold text-gray-900 mb-1">
            Services for members
          </Text>
          <Text className="text-sm text-gray-500 mb-5">
            Everything you need as a registered agro dealer in Nagpur.
          </Text>

          <View className={`${useStackedLayout ? 'flex-col' : 'flex-row flex-wrap'} gap-3`}>
            <ServiceCard
              icon={<Shield size={22} color="#15803d" />}
              title="Member welfare"
              description="We address issues faced by dealers and ensure your voices are heard."
              width={useStackedLayout ? undefined : serviceCardWidth}
            />
            <ServiceCard
              icon={<BookOpen size={22} color="#15803d" />}
              title="Policy updates"
              description="Timely updates on government rules, licensing, and compliance matters."
              width={useStackedLayout ? undefined : serviceCardWidth}
            />
            <ServiceCard
              icon={<Megaphone size={22} color="#15803d" />}
              title="Training & awareness"
              description="Workshops and guidance on best practices in agri-input distribution."
              width={useStackedLayout ? undefined : serviceCardWidth}
            />
            <ServiceCard
              icon={<Scale size={22} color="#15803d" />}
              title="Representation"
              description="Unified representation at district and state levels for collective growth."
              width={useStackedLayout ? undefined : serviceCardWidth}
            />
          </View>
        </View>

        {/* ===== WHY JOIN SECTION ===== */}
        <View className="px-4 mt-7 mb-2">
          <Text className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">
            MEMBER BENEFITS
          </Text>
          <Text className="text-xl font-bold text-gray-900 mb-1">
            Why join NDADA?
          </Text>
          <Text className="text-sm text-gray-500 mb-5">
            Be part of a trusted, progressive agro dealer community.
          </Text>

          <View className={`${useStackedLayout ? 'flex-col' : 'flex-row flex-wrap'} gap-x-4 gap-y-3`}>
            <BenefitItem text="Strong professional network across Nagpur" width={useStackedLayout ? undefined : benefitItemWidth} />
            <BenefitItem text="Access to official notices and updates" width={useStackedLayout ? undefined : benefitItemWidth} />
            <BenefitItem text="Regulatory and compliance support" width={useStackedLayout ? undefined : benefitItemWidth} />
            <BenefitItem text="Participate in key meetings" width={useStackedLayout ? undefined : benefitItemWidth} />
            <BenefitItem text="Collective problem-solving strength" width={useStackedLayout ? undefined : benefitItemWidth} />
            <BenefitItem text="Trusted community representation" width={useStackedLayout ? undefined : benefitItemWidth} />
          </View>
        </View>

        {/* ===== JOIN US CTA ===== */}
        <View className="mx-4 mt-7 mb-8 rounded-2xl overflow-hidden relative">
          {/* Dark green gradient background */}
          <View
            className="absolute inset-0"
            style={{ backgroundColor: '#14532d' }}
          />
          {/* Decorative glow */}
          <View
            className="absolute"
            style={{
              width: 250,
              height: 250,
              borderRadius: 125,
              backgroundColor: 'rgba(34, 197, 94, 0.1)',
              top: -60,
              right: -50,
            }}
          />

          <View className="relative px-6 py-8 items-center">
            <Text className="text-xl font-bold text-white text-center mb-2">
              Join us. Stay connected. Grow together.
            </Text>
            <Text className="text-sm text-center mb-6" style={{ color: 'rgba(187, 247, 208, 0.7)' }}>
              Become an active member of NDADA and be part of a trusted, progressive community of agro dealers.
            </Text>
            <TouchableOpacity
              onPress={() => router.push('/(auth)/register')}
              className="flex-row items-center gap-2 rounded-lg px-6 py-3 bg-primary-500"
              activeOpacity={0.85}
            >
              <Text className="text-white font-semibold text-sm">Register Now</Text>
              <ArrowRight size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* ============================================================
   Sub-components
   ============================================================ */

function StatItem({ value, label, border }: { value: string; label: string; border?: boolean }) {
  return (
    <View
      className="flex-1 items-center py-4 px-1"
      style={border ? { borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#e5e7eb' } : undefined}
    >
      <Text className="text-xl font-bold text-gray-900 text-center" numberOfLines={1}>{value}</Text>
      <Text className="text-[10px] text-gray-500 mt-0.5 text-center" numberOfLines={2}>{label}</Text>
    </View>
  );
}

function ServiceCard({
  icon,
  title,
  description,
  width,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  width?: number;
}) {
  return (
    <View
      className="rounded-xl border border-gray-200 bg-white p-4"
      style={width ? { width } : { width: '100%' }}
    >
      <View className="mb-3 w-10 h-10 rounded-lg bg-primary-50 items-center justify-center">
        {icon}
      </View>
      <Text className="text-sm font-bold text-gray-900 mb-1">{title}</Text>
      <Text className="text-xs text-gray-500 leading-4">{description}</Text>
    </View>
  );
}

function BenefitItem({ text, width }: { text: string; width?: number }) {
  return (
    <View className="flex-row items-center gap-2" style={width ? { width } : { width: '100%' }}>
      <CheckCircle size={14} color="#16a34a" />
      <Text className="text-xs text-gray-700 flex-1">{text}</Text>
    </View>
  );
}
