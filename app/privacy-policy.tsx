import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Stack, router } from 'expo-router';
import { Shield, ArrowLeft, Info, HelpCircle } from 'lucide-react-native';

export default function PrivacyPolicyScreen() {
  return (
    <View className="flex-1 bg-white">
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Privacy Policy',
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
            <Shield size={32} color="#166534" />
          </View>
          <Text className="text-2xl font-bold text-gray-900 text-center">Privacy Policy</Text>
          <Text className="text-xs text-gray-500 mt-1">Last Updated: July 24, 2026</Text>
        </View>

        <Text className="text-sm text-gray-600 mb-6 leading-5">
          Nagpur District Agro Dealers Association (NDADA) ("we", "us", or "our") operates the NDADA mobile application (the "App"). We are committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your personal information when you use our App to register and manage your membership with the association.
        </Text>

        {/* Section 1: Information Collection */}
        <View className="mb-6">
          <Text className="text-lg font-bold text-gray-900 mb-2">1. Information We Collect</Text>
          <Text className="text-sm text-gray-600 mb-3 leading-5">
            To provide our services, verify membership eligibility, and issue official certificates, we collect the following types of information:
          </Text>

          <View className="bg-gray-50 rounded-xl p-4 gap-3 border border-gray-100">
            <View>
              <Text className="text-sm font-semibold text-gray-800">• Personal Information</Text>
              <Text className="text-xs text-gray-600 mt-0.5">Your name, email address, phone number, physical address, and district.</Text>
            </View>
            <View>
              <Text className="text-sm font-semibold text-gray-800">• Firm Information</Text>
              <Text className="text-xs text-gray-600 mt-0.5">Firm name, firm type, firm address, license numbers (general, pesticide, fertilizer, seed-cotton), GST number, IFMS number, and contact details.</Text>
            </View>
            <View>
              <Text className="text-sm font-semibold text-gray-800">• Verification Documents</Text>
              <Text className="text-xs text-gray-600 mt-0.5">Uploaded files including photo identity proof (e.g., Aadhaar card, license copies) and applicant photos.</Text>
            </View>
            <View>
              <Text className="text-sm font-semibold text-gray-800">• Identity Numbers</Text>
              <Text className="text-xs text-gray-600 mt-0.5">Aadhaar card number, which is strictly used for verification purposes and masked (XXXX-XXXX-1234) in displays.</Text>
            </View>
            <View>
              <Text className="text-sm font-semibold text-gray-800">• Payment Information</Text>
              <Text className="text-xs text-gray-600 mt-0.5">Details regarding membership fees paid, payment status, verification logs, and transaction reference IDs.</Text>
            </View>
          </View>
        </View>

        {/* Section 2: How We Use Information */}
        <View className="mb-6">
          <Text className="text-lg font-bold text-gray-900 mb-2">2. How We Use Your Information</Text>
          <Text className="text-sm text-gray-600 leading-5">
            We use the collected information to:
            {'\n'}• Verify your identity and eligibility as an agro dealer.
            {'\n'}• Process your membership application and issue certificates.
            {'\n'}• Facilitate secure payments for membership.
            {'\n'}• Provide updates, notices, and communications regarding association affairs.
            {'\n'}• Perform internal administration and comply with legal requirements.
          </Text>
        </View>

        {/* Section 3: Service Providers */}
        <View className="mb-6">
          <Text className="text-lg font-bold text-gray-900 mb-2">3. Third-Party Service Providers</Text>
          <Text className="text-sm text-gray-600 mb-3 leading-5">
            We share your data only with trusted infrastructure providers required to operate the App:
          </Text>
          <View className="bg-primary-50/50 rounded-xl p-4 gap-3 border border-primary-100/50">
            <View>
              <Text className="text-sm font-bold text-primary-900">Supabase</Text>
              <Text className="text-xs text-primary-800 mt-0.5">
                We use Supabase for secure cloud authentication, database storage, file hosting, and backend serverless operations.
              </Text>
            </View>
            <View>
              <Text className="text-sm font-bold text-primary-900">Razorpay</Text>
              <Text className="text-xs text-primary-800 mt-0.5">
                We use Razorpay to process online membership payments securely. Your credit card, UPI, or banking details are handled directly by Razorpay in compliance with industry security regulations (PCI-DSS).
              </Text>
            </View>
          </View>
        </View>

        {/* Section 4: Data Retention & Deletion */}
        <View className="mb-6">
          <Text className="text-lg font-bold text-gray-900 mb-2">4. Data Retention & Deletion</Text>
          <Text className="text-sm text-gray-600 leading-5">
            We retain your information as long as your membership is active or required for administrative purposes. In accordance with Play Store policy, you have the right to request deletion of your account. Deletion will anonymize your personal identifying information (e.g. name, email, phone) and remove uploaded documents from storage, while retaining payment references for financial auditing.
          </Text>
        </View>

        {/* Section 5: Security */}
        <View className="mb-6">
          <Text className="text-lg font-bold text-gray-900 mb-2">5. Data Security</Text>
          <Text className="text-sm text-gray-600 leading-5">
            We implement strict technical and organizational measures to safeguard your data. This includes database Row Level Security (RLS), masking sensitive fields like Aadhaar numbers, and transmitting data over secure HTTPS connections.
          </Text>
        </View>

        {/* Section 6: Children's Privacy */}
        <View className="mb-6">
          <Text className="text-lg font-bold text-gray-900 mb-2">6. Children's Privacy</Text>
          <Text className="text-sm text-gray-600 leading-5">
            The App is intended for professional agro dealers and is not directed at children under the age of 18. We do not knowingly collect personal information from children. If we become aware that a child under 18 has provided us with personal data, we will delete such information immediately.
          </Text>
        </View>

        {/* Section 7: Changes */}
        <View className="mb-6">
          <Text className="text-lg font-bold text-gray-900 mb-2">7. Changes to This Policy</Text>
          <Text className="text-sm text-gray-600 leading-5">
            We may update this Privacy Policy from time to time. Any changes will be reflected by updating the "Last Updated" date at the top of this document. We encourage you to review this policy periodically.
          </Text>
        </View>

        {/* Section 8: Contact Info */}
        <View className="mb-6">
          <Text className="text-lg font-bold text-gray-900 mb-2">8. Contact Us</Text>
          <Text className="text-sm text-gray-600 leading-5">
            If you have questions about this Privacy Policy, wish to exercise your data rights, or want to request account deletion, please contact Nagpur District Agro Dealers Association (NDADA) at:
            {'\n'}Email: support@ndada.org
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
