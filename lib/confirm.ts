import { Alert, Platform } from 'react-native';

type ConfirmOptions = {
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
};

export async function confirm(
  title: string,
  message: string,
  options: ConfirmOptions = {}
): Promise<boolean> {
  const confirmText = options.confirmText ?? 'Confirm';
  const cancelText = options.cancelText ?? 'Cancel';
  const destructive = options.destructive ?? false;

  if (Platform.OS === 'web') {
    const webConfirm = (globalThis as any)?.confirm as ((text?: string) => boolean) | undefined;
    if (typeof webConfirm === 'function') {
      return Boolean(webConfirm(`${title}\n\n${message}`));
    }

    // Worst-case fallback: no confirmation mechanism; treat as cancelled.
    return false;
  }

  return new Promise<boolean>((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: cancelText, style: 'cancel', onPress: () => resolve(false) },
        {
          text: confirmText,
          style: destructive ? 'destructive' : 'default',
          onPress: () => resolve(true),
        },
      ],
      {
        cancelable: true,
        onDismiss: () => resolve(false),
      }
    );
  });
}
