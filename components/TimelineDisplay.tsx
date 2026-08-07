import { View, Text } from 'react-native';
import { StatusTimeline, TimelineEvent } from '@/types';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { CheckCircle2, AlertCircle } from 'lucide-react-native';

export function TimelineDisplay({ timeline }: { timeline: StatusTimeline | null | undefined }) {
  if (!timeline || Object.keys(timeline).length === 0) {
    return null;
  }

  // User-facing timeline stages only: Submitted → Payment Verified
  // (Certificate issuance is shown separately on the certificate page)
  // Admin-internal stages (under_review, approved, rejected) are intentionally excluded
  const stages: Array<{
    key: keyof StatusTimeline;
    label: string;
    icon: React.ReactNode;
    color: string;
    bgColor: string;
    getMetadata?: (event: TimelineEvent & any) => string;
  }> = [
    {
      key: 'submitted',
      label: 'Application Submitted',
      icon: <CheckCircle2 size={24} color="#15803d" />,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
      getMetadata: (event) => {
        const date = event.timestamp ? formatDistanceToNow(parseISO(event.timestamp), { addSuffix: true }) : 'Unknown';
        return `Submitted ${date}`;
      },
    },
    {
      key: 'payment_verified',
      label: 'Payment Verified',
      icon: <CheckCircle2 size={24} color="#16a34a" />,
      color: 'text-primary-600',
      bgColor: 'bg-primary-100',
      getMetadata: (event) => {
        const date = event.timestamp ? formatDistanceToNow(parseISO(event.timestamp), { addSuffix: true }) : 'Unknown';
        return `Verified ${date}`;
      },
    },
  ];

  return (
    <View className="space-y-4">
      <Text className="text-lg font-semibold text-gray-900">Your Progress</Text>

      <View className="relative space-y-0">
        {stages.map((stage, index) => {
          const event = timeline[stage.key] as (TimelineEvent & any) | undefined;
          const isCompleted = event !== undefined;
          const isLast = index === stages.length - 1;

          return (
            <View key={stage.key}>
              {/* Connector line (don't show after last item) */}
              {!isLast && isCompleted && (
                <View
                  className="absolute left-6 top-16 bottom-0 w-1 bg-gray-300"
                  style={{
                    height: 32,
                  }}
                />
              )}

              {/* Timeline item */}
              <View className="flex-row gap-4 pb-6">
                {/* Icon circle */}
                <View
                  className={`${stage.bgColor} rounded-full p-2 ${!isCompleted ? 'opacity-50' : ''}`}
                >
                  {isCompleted ? stage.icon : <AlertCircle size={24} color="#9ca3af" />}
                </View>

                {/* Content */}
                <View className="flex-1 pt-1">
                  <Text className={`font-semibold ${isCompleted ? stage.color : 'text-gray-400'}`}>
                    {stage.label}
                  </Text>
                  {isCompleted && event ? (
                    <Text className="mt-1 text-sm text-gray-600">
                      {stage.getMetadata?.(event) || ''}
                    </Text>
                  ) : (
                    <Text className="mt-1 text-sm text-gray-400">Pending</Text>
                  )}
                </View>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}
