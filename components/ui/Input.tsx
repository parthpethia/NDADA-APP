import { useState } from 'react';
import { TextInput, View, Text, TouchableOpacity } from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { cn } from '@/lib/utils';

interface InputProps {
  label?: string;
  placeholder?: string;
  value: string;
  onChangeText: (text: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'numeric';
  multiline?: boolean;
  numberOfLines?: number;
  error?: string;
  editable?: boolean;
  className?: string;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}

export function Input({
  label,
  placeholder,
  value,
  onChangeText,
  secureTextEntry,
  keyboardType = 'default',
  multiline = false,
  numberOfLines = 1,
  error,
  editable = true,
  className,
  autoCapitalize = 'sentences',
}: InputProps) {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const isPassword = secureTextEntry === true;

  return (
    <View className={cn('mb-4', className)}>
      {label && (
        <Text className="mb-1.5 text-sm font-medium text-gray-700">{label}</Text>
      )}
      <View className="relative">
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#9ca3af"
          secureTextEntry={isPassword && !passwordVisible}
          keyboardType={keyboardType}
          multiline={multiline}
          numberOfLines={numberOfLines}
          editable={editable}
          autoCapitalize={autoCapitalize}
          className={cn(
            'rounded-lg border bg-white px-3.5 py-2.5 text-base text-gray-900',
            error ? 'border-red-500' : 'border-gray-300',
            !editable && 'bg-gray-50 text-gray-500',
            multiline && 'min-h-[100px] text-start',
            isPassword && 'pr-12'
          )}
          style={multiline ? { textAlignVertical: 'top' } : undefined}
        />
        {isPassword && (
          <TouchableOpacity
            onPress={() => setPasswordVisible((prev) => !prev)}
            activeOpacity={0.6}
            className="absolute right-0 top-0 bottom-0 items-center justify-center px-3"
            accessibilityLabel={passwordVisible ? 'Hide password' : 'Show password'}
            accessibilityRole="button"
          >
            {passwordVisible ? (
              <EyeOff size={20} color="#6b7280" />
            ) : (
              <Eye size={20} color="#6b7280" />
            )}
          </TouchableOpacity>
        )}
      </View>
      {error && <Text className="mt-1 text-sm text-red-600">{error}</Text>}
    </View>
  );
}
