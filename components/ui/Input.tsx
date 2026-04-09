import { TextInput, View, Text } from 'react-native';
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
  return (
    <View className={cn('mb-4', className)}>
      {label && (
        <Text className="mb-1.5 text-sm font-medium text-gray-700">{label}</Text>
      )}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9ca3af"
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        multiline={multiline}
        numberOfLines={numberOfLines}
        editable={editable}
        autoCapitalize={autoCapitalize}
        className={cn(
          'rounded-lg border bg-white px-3.5 py-2.5 text-base text-gray-900',
          error ? 'border-red-500' : 'border-gray-300',
          !editable && 'bg-gray-50 text-gray-500',
          multiline && 'min-h-[100px] text-start'
        )}
        style={multiline ? { textAlignVertical: 'top' } : undefined}
      />
      {error && <Text className="mt-1 text-sm text-red-600">{error}</Text>}
    </View>
  );
}
