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
import { APP_NAME } from '@/constants';
import {
  Lock,
  UserPlus,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Shield,
  BookOpen,
  Megaphone,
  Scale,
  CheckCircle,
  ArrowRight,
} from 'lucide-react-native';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const { width: screenWidth } = useWindowDimensions();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loginOpen, setLoginOpen] = useState(false);

  // Animation value for dropdown
  const dropdownAnim = useRef(new Animated.Value(0)).current;

  // Dynamic height that accounts for error message
  const formHeight = error ? 360 : 320;

  useEffect(() => {
    Animated.timing(dropdownAnim, {
      toValue: loginOpen ? 1 : 0,
      duration: 350,
      useNativeDriver: false,
    }).start();
  }, [loginOpen]);

  const dropdownHeight = dropdownAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, formHeight],
  });

  const dropdownOpacity = dropdownAnim.interpolate({
    inputRange: [0, 0.3, 1],
    outputRange: [0, 0, 1],
  });

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }
    setLoading(true);
    setError('');
    const { error: err } = await signIn(email, password);
    if (err) setError(err);
    setLoading(false);
  };

  const toggleLogin = () => {
    setLoginOpen((prev) => !prev);
    if (!loginOpen) {
      setError('');
    }
  };

  // Responsive card widths — recalculated on resize
  const serviceCardWidth = Math.min((screenWidth - 44) / 2, 200);
  const benefitItemWidth = Math.min((screenWidth - 48) / 2, 220);
  // On narrow screens (<360px), stack to single column
  const useStackedLayout = screenWidth < 360;

  return (
    <KeyboardAvoidingView
      className="flex-1"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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

          <View className="relative px-6 pt-12 pb-8 items-center">
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
              className="mb-5 rounded-full px-5 py-2 flex-row items-center gap-2"
              style={{ backgroundColor: 'rgba(34, 197, 94, 0.2)', borderWidth: 1, borderColor: 'rgba(34, 197, 94, 0.3)' }}
            >
              <View className="w-2 h-2 rounded-full bg-primary-400" />
              <Text className="text-primary-300 text-xs font-semibold tracking-wide">
                Nagpur District Agro Dealers Association
              </Text>
            </View>

            {/* Main heading */}
            <Text className="text-white text-3xl font-bold text-center mb-3 leading-9">
              Serving Agro Dealers.{'\n'}Strengthening Agriculture.
            </Text>

            {/* Subtitle */}
            <Text
              className="text-center text-sm mb-7 leading-5"
              style={{ color: 'rgba(187, 247, 208, 0.8)' }}
            >
              A dedicated platform protecting the rights of agro dealers across Nagpur
              District — your voice, your network, your growth.
            </Text>

            {/* Action Buttons */}
            <View className={`${useStackedLayout ? 'flex-col' : 'flex-row'} items-center gap-3 mb-2`}>
              <TouchableOpacity
                onPress={toggleLogin}
                className="flex-row items-center gap-2 rounded-lg px-5 py-3"
                style={{
                  backgroundColor: loginOpen ? 'rgba(34, 197, 94, 0.3)' : 'rgba(255,255,255,0.12)',
                  borderWidth: 1,
                  borderColor: loginOpen ? '#22c55e' : 'rgba(255,255,255,0.2)',
                }}
                activeOpacity={0.7}
              >
                <Lock size={15} color="#bbf7d0" />
                <Text className="text-white font-semibold text-sm">Member login</Text>
                {loginOpen ? (
                  <ChevronUp size={14} color="#bbf7d0" />
                ) : (
                  <ChevronDown size={14} color="#bbf7d0" />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => router.push('/(auth)/register')}
                className="flex-row items-center gap-2 rounded-lg px-5 py-3 bg-primary-600"
                activeOpacity={0.8}
              >
                <UserPlus size={15} color="#fff" />
                <Text className="text-white font-semibold text-sm">Register as member</Text>
              </TouchableOpacity>
            </View>

            {/* ===== LOGIN DROPDOWN ===== */}
            <Animated.View
              style={{
                height: dropdownHeight,
                opacity: dropdownOpacity,
                overflow: 'hidden',
                width: '100%',
                maxWidth: 380,
              }}
            >
              <View
                className="mt-4 rounded-2xl p-5"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.08)',
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.15)',
                }}
              >
                {/* Error */}
                {error ? (
                  <View className="mb-3 rounded-lg p-3 flex-row items-center gap-2" style={{ backgroundColor: 'rgba(239,68,68,0.15)' }}>
                    <AlertCircle size={14} color="#fca5a5" />
                    <Text className="text-sm flex-1" style={{ color: '#fca5a5' }}>{error}</Text>
                  </View>
                ) : null}

                {/* Email / Member ID Input */}
                <Text className="mb-1.5 text-xs font-medium" style={{ color: 'rgba(187,247,208,0.7)' }}>
                  Email / Member ID
                </Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  placeholderTextColor="rgba(156,163,175,0.6)"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  className="mb-3 rounded-lg px-4 py-3 text-sm"
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.07)',
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.12)',
                    color: '#fff',
                  }}
                />

                {/* Password Input */}
                <Text className="mb-1.5 text-xs font-medium" style={{ color: 'rgba(187,247,208,0.7)' }}>
                  Password
                </Text>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Enter your password"
                  placeholderTextColor="rgba(156,163,175,0.6)"
                  secureTextEntry
                  className="mb-3 rounded-lg px-4 py-3 text-sm"
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.07)',
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.12)',
                    color: '#fff',
                  }}
                />

                {/* Forgot Password */}
                <View className="items-end mb-3">
                  <Link href="/(auth)/forgot-password">
                    <Text className="text-xs font-medium text-primary-300">Forgot Password?</Text>
                  </Link>
                </View>

                {/* Sign In Button */}
                <TouchableOpacity
                  onPress={handleLogin}
                  disabled={loading}
                  className="rounded-lg py-3 items-center justify-center flex-row gap-2 bg-primary-600"
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

        {/* ===== NOTICE BAR ===== */}
        <View className="mx-4 mt-5 rounded-xl bg-yellow-50 border border-yellow-200 px-4 py-3 flex-row items-start gap-3">
          <View className="mt-0.5 rounded-full bg-yellow-200 p-1">
            <AlertCircle size={14} color="#ca8a04" />
          </View>
          <View className="flex-1">
            <Text className="text-xs text-yellow-800 leading-5">
              <Text className="font-semibold">Latest notice: </Text>
              Annual general meeting scheduled for next month. All registered members are requested to attend.{' '}
              <Text className="font-semibold text-yellow-900 underline">Read more</Text>
            </Text>
          </View>
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
      className="flex-1 items-center py-4"
      style={border ? { borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#e5e7eb' } : undefined}
    >
      <Text className="text-xl font-bold text-gray-900">{value}</Text>
      <Text className="text-[10px] text-gray-500 mt-0.5">{label}</Text>
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
      style={width ? { width } : { flex: 1, minWidth: 140 }}
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
    <View className="flex-row items-center gap-2" style={width ? { width } : { flex: 1, minWidth: 140 }}>
      <CheckCircle size={14} color="#16a34a" />
      <Text className="text-xs text-gray-700 flex-1">{text}</Text>
    </View>
  );
}
