import { View, Text, TouchableOpacity, Modal, FlatList } from 'react-native';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { ChevronDown } from 'lucide-react-native';

interface SelectOption {
  label: string;
  value: string;
}

interface SelectProps {
  label?: string;
  options: readonly SelectOption[] | SelectOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  className?: string;
}

export function Select({
  label,
  options,
  value,
  onValueChange,
  placeholder = 'Select...',
  error,
  className,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <View className={cn('mb-4', className)}>
      {label && (
        <Text className="mb-1.5 text-sm font-medium text-gray-700">{label}</Text>
      )}
      <TouchableOpacity
        onPress={() => setOpen(true)}
        className={cn(
          'flex-row items-center justify-between rounded-lg border bg-white px-3.5 py-2.5',
          error ? 'border-red-500' : 'border-gray-300'
        )}
      >
        <Text className={cn('text-base', selected ? 'text-gray-900' : 'text-gray-400')}>
          {selected ? selected.label : placeholder}
        </Text>
        <ChevronDown size={20} color="#6b7280" />
      </TouchableOpacity>
      {error && <Text className="mt-1 text-sm text-red-600">{error}</Text>}

      <Modal visible={open} transparent animationType="fade">
        <TouchableOpacity
          className="flex-1 justify-center bg-black/50 px-6"
          activeOpacity={1}
          onPress={() => setOpen(false)}
        >
          <View className="max-h-[400px] rounded-xl bg-white p-2 shadow-lg">
            <Text className="px-3 py-2 text-sm font-semibold text-gray-500">
              {label || 'Select an option'}
            </Text>
            <FlatList
              data={options as SelectOption[]}
              keyExtractor={(item) => item.value}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => {
                    onValueChange(item.value);
                    setOpen(false);
                  }}
                  className={cn(
                    'rounded-lg px-3 py-2.5',
                    item.value === value && 'bg-primary-50'
                  )}
                >
                  <Text
                    className={cn(
                      'text-base',
                      item.value === value
                        ? 'font-semibold text-primary-700'
                        : 'text-gray-900'
                    )}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}
