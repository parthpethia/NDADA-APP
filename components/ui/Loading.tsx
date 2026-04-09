import { View, ActivityIndicator, Text } from 'react-native';

export function LoadingScreen({ message }: { message?: string }) {
  return (
    <View className="flex-1 items-center justify-center bg-white">
      <ActivityIndicator size="large" color="#1d4ed8" />
      {message && <Text className="mt-3 text-gray-500">{message}</Text>}
    </View>
  );
}

export function EmptyState({
  title,
  message,
  children,
}: {
  title: string;
  message?: string;
  children?: React.ReactNode;
}) {
  return (
    <View className="flex-1 items-center justify-center p-8">
      <Text className="text-lg font-semibold text-gray-900">{title}</Text>
      {message && (
        <Text className="mt-1 text-center text-gray-500">{message}</Text>
      )}
      {children && <View className="mt-4">{children}</View>}
    </View>
  );
}
