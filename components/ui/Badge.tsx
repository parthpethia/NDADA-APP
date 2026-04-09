import { View, Text } from 'react-native';
import { cn } from '@/lib/utils';

type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-gray-100',
  success: 'bg-green-100',
  warning: 'bg-yellow-100',
  error: 'bg-red-100',
  info: 'bg-blue-100',
};

const variantTextStyles: Record<BadgeVariant, string> = {
  default: 'text-gray-700',
  success: 'text-green-700',
  warning: 'text-yellow-700',
  error: 'text-red-700',
  info: 'text-blue-700',
};

export function Badge({ label, variant = 'default', className }: BadgeProps) {
  return (
    <View
      className={cn(
        'self-start rounded-full px-2.5 py-0.5',
        variantStyles[variant],
        className
      )}
    >
      <Text className={cn('text-xs font-medium', variantTextStyles[variant])}>
        {label}
      </Text>
    </View>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: BadgeVariant }> = {
    pending: { label: 'Pending', variant: 'warning' },
    paid: { label: 'Paid', variant: 'success' },
    failed: { label: 'Failed', variant: 'error' },
    approved: { label: 'Approved', variant: 'success' },
    rejected: { label: 'Rejected', variant: 'error' },
    active: { label: 'Active', variant: 'success' },
    suspended: { label: 'Suspended', variant: 'error' },
    deleted: { label: 'Deleted', variant: 'error' },
    valid: { label: 'Valid', variant: 'success' },
    revoked: { label: 'Revoked', variant: 'error' },
  };
  const entry = map[status] || { label: status, variant: 'default' as BadgeVariant };
  return <Badge label={entry.label} variant={entry.variant} />;
}
