import { View, Text } from 'react-native';
import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className }: CardProps) {
  return (
    <View
      className={cn(
        'rounded-xl border border-gray-200 bg-white p-4 shadow-sm',
        className
      )}
    >
      {children}
    </View>
  );
}

interface CardHeaderProps {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}

export function CardHeader({ title, subtitle, right }: CardHeaderProps) {
  return (
    <View className="mb-3 flex-row items-center justify-between">
      <View className="flex-1">
        <Text className="text-lg font-semibold text-gray-900">{title}</Text>
        {subtitle && (
          <Text className="mt-0.5 text-sm text-gray-500">{subtitle}</Text>
        )}
      </View>
      {right}
    </View>
  );
}
