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
      try {
        const result = webConfirm(`${title}\n\n${message}`);
        return Boolean(result);
      } catch (e) {
        console.warn('Web confirm dialog error:', e);
        // Fallback to alert-based confirmation
        return confirmWithAlert(title, message, confirmText);
      }
    }

    // Fallback: use alert-based confirmation
    return confirmWithAlert(title, message, confirmText);
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

function confirmWithAlert(title: string, message: string, confirmText: string): boolean {
  // Worst-case fallback when neither window.confirm nor Alert work on web
  // Use the native browser confirm as final attempt
  try {
    return Boolean(window.confirm(`${title}\n\n${message}`));
  } catch {
    // If all else fails, don't proceed with the action
    return false;
  }
}
