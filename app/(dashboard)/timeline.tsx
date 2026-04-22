import { View, Text } from 'react-native';
import { StatusTimeline, TimelineEvent } from '@/types';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { CheckCircle2, Clock, AlertCircle, XCircle } from 'lucide-react-native';

export function TimelineDisplay({ timeline }: { timeline: StatusTimeline | null | undefined }) {
  if (!timeline || Object.keys(timeline).length === 0) {
    return null;
  }

  // Define timeline stages in order
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
      icon: <CheckCircle2 size={24} color="#2563eb" />,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
      getMetadata: (event) => {
        const date = event.timestamp ? formatDistanceToNow(parseISO(event.timestamp), { addSuffix: true }) : 'Unknown';
        return `Verified ${date}`;
      },
    },
    {
      key: 'under_review',
      label: 'Under Review',
      icon: <Clock size={24} color="#f59e0b" />,
      color: 'text-amber-600',
      bgColor: 'bg-amber-100',
      getMetadata: (event) => {
        const assignedTo = event.assigned_to_admin && event.assigned_to_admin !== 'unassigned' ? `by ${event.assigned_to_admin}` : '';
        const date = event.timestamp ? formatDistanceToNow(parseISO(event.timestamp), { addSuffix: true }) : 'Unknown';
        return `Under review ${assignedTo} ${date}`;
      },
    },
    {
      key: 'approved',
      label: 'Approved',
      icon: <CheckCircle2 size={24} color="#059669" />,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-100',
      getMetadata: (event) => {
        const approvedBy = event.approved_by || 'System';
        const date = event.timestamp ? formatDistanceToNow(parseISO(event.timestamp), { addSuffix: true }) : 'Unknown';
        return `Approved by ${approvedBy} ${date}`;
      },
    },
    {
      key: 'rejected',
      label: 'Rejected',
      icon: <XCircle size={24} color="#dc2626" />,
      color: 'text-red-600',
      bgColor: 'bg-red-100',
      getMetadata: (event) => {
        const reason = event.reason || 'No reason provided';
        const date = event.timestamp ? formatDistanceToNow(parseISO(event.timestamp), { addSuffix: true }) : 'Unknown';
        return `${reason} ${date}`;
      },
    },
  ];

  return (
    <View className="space-y-4">
      <Text className="text-lg font-semibold text-gray-900">Application Progress</Text>

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
