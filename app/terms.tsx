import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Stack, router } from 'expo-router';
import { Scale, ArrowLeft } from 'lucide-react-native';

export default function TermsScreen() {
  return (
    <View className="flex-1 bg-white">
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Terms of Service',
          headerStyle: { backgroundColor: '#166534' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '600' },
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} className="mr-4">
              <ArrowLeft size={22} color="#fff" />
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView className="flex-1" contentContainerClassName="p-6 pb-12">
        <View className="items-center mb-6">
          <View className="w-16 h-16 bg-primary-50 rounded-full items-center justify-center mb-3">
            <Scale size={32} color="#166534" />
          </View>
          <Text className="text-2xl font-bold text-gray-900 text-center">Terms of Service</Text>
          <Text className="text-xs text-gray-500 mt-1">Last Updated: July 24, 2026</Text>
        </View>

        <Text className="text-sm text-gray-600 mb-6 leading-5">
          Please read these Terms of Service ("Terms") carefully before using the NDADA mobile application (the "App") operated by Nagpur District Agro Dealers Association ("NDADA", "we", "us", or "our"). By registering for a membership through this App, you agree to be bound by these Terms.
        </Text>

        {/* Section 1: Membership Eligibility */}
        <View className="mb-6">
          <Text className="text-lg font-bold text-gray-900 mb-2">1. Membership Eligibility</Text>
          <Text className="text-sm text-gray-600 leading-5">
            Membership in NDADA is open to authorized agro dealers operating within Nagpur District. To qualify, you must possess valid government-issued licenses for agricultural inputs (e.g., seeds, pesticides, fertilizers) and provide accurate information regarding your firm, licenses, and identity. We reserve the right to reject any application that does not meet our verification criteria.
          </Text>
        </View>

        {/* Section 2: Membership Fees & Refunds */}
        <View className="mb-6">
          <Text className="text-lg font-bold text-gray-900 mb-2">2. Fees & Refund Policy</Text>
          <Text className="text-sm text-gray-600 leading-5">
            Registration for membership requires payment of a one-time fee of ₹300 (Rupees Three Hundred only). Payments are made securely via the App. 
            {'\n\n'}
            <Text className="font-semibold text-gray-800">Refund Policy:</Text> Membership fees are non-refundable once an application is approved and a certificate is issued. If an application is rejected during verification, any refundable amount will be processed according to our internal policies.
          </Text>
        </View>

        {/* Section 3: Association Rules & Code of Conduct */}
        <View className="mb-6">
          <Text className="text-lg font-bold text-gray-900 mb-2">3. Rules & Code of Conduct</Text>
          <Text className="text-sm text-gray-600 leading-5">
            As a member of NDADA, you agree to:
            {'\n'}• Abide by all official rules, bylaws, and resolutions passed by the association.
            {'\n'}• Maintain high ethical standards in agricultural business operations.
            {'\n'}• Refrain from any activity that brings disrepute to the association or its members.
            {'\n'}• Provide updated licensing and contact information when requested.
          </Text>
        </View>

        {/* Section 4: Account Deletion & Termination */}
        <View className="mb-6">
          <Text className="text-lg font-bold text-gray-900 mb-2">4. Termination & Deletion</Text>
          <Text className="text-sm text-gray-600 leading-5">
            You may request deletion of your account at any time through the Profile screen. We reserve the right to suspend or terminate your membership if you violate these Terms, provide fraudulent licensing documents, or fail to adhere to the code of conduct.
          </Text>
        </View>

        {/* Section 5: Limitation of Liability */}
        <View className="mb-6">
          <Text className="text-lg font-bold text-gray-900 mb-2">5. Disclaimer & Limitation of Liability</Text>
          <Text className="text-sm text-gray-600 leading-5">
            The App and the membership services are provided on an "as-is" and "as-available" basis. NDADA makes no warranties, expressed or implied, regarding the continuous availability of the App. NDADA shall not be liable for any direct or indirect damages arising out of your participation in the association or use of the App.
          </Text>
        </View>

        {/* Section 6: Changes to Terms */}
        <View className="mb-6">
          <Text className="text-lg font-bold text-gray-900 mb-2">6. Governing Law & Jurisdiction</Text>
          <Text className="text-sm text-gray-600 leading-5">
            These Terms shall be governed by the laws of India. Any disputes arising under these Terms shall be subject to the exclusive jurisdiction of the courts located in Nagpur, Maharashtra.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
