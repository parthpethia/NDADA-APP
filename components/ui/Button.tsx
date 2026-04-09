import { TouchableOpacity, Text, ActivityIndicator } from 'react-native';
import { cn } from '@/lib/utils';

interface ButtonProps {
  onPress?: () => void;
  title: string;
  variant?: 'primary' | 'secondary' | 'destructive' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}

const variantStyles = {
  primary: 'bg-primary-700 active:bg-primary-800',
  secondary: 'bg-gray-200 active:bg-gray-300',
  destructive: 'bg-red-600 active:bg-red-700',
  outline: 'border border-gray-300 bg-transparent active:bg-gray-100',
  ghost: 'bg-transparent active:bg-gray-100',
};

const variantTextStyles = {
  primary: 'text-white',
  secondary: 'text-gray-900',
  destructive: 'text-white',
  outline: 'text-gray-900',
  ghost: 'text-gray-900',
};

const sizeStyles = {
  sm: 'px-3 py-1.5',
  md: 'px-4 py-2.5',
  lg: 'px-6 py-3.5',
};

const sizeTextStyles = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-lg',
};

export function Button({
  onPress,
  title,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  className,
}: ButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      className={cn(
        'flex-row items-center justify-center rounded-lg',
        variantStyles[variant],
        sizeStyles[size],
        (disabled || loading) && 'opacity-50',
        className
      )}
    >
      {loading && (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' || variant === 'destructive' ? '#fff' : '#111'}
          style={{ marginRight: 8 }}
        />
      )}
      <Text
        className={cn(
          'font-semibold',
          variantTextStyles[variant],
          sizeTextStyles[size]
        )}
      >
        {title}
      </Text>
    </TouchableOpacity>
  );
}
