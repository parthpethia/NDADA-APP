// Polyfill TextDecoder for React Native / Expo environment
// Fixes RangeError: Unknown encoding: latin1 in packages like jspdf -> fast-png
if (typeof global !== 'undefined') {
  const NativeTextDecoder =
    typeof global.TextDecoder !== 'undefined' ? global.TextDecoder : null;
  // @ts-ignore
  global.TextDecoder = class TextDecoderPolyfill {
    encoding: string;
    decoder: any;

    constructor(label = 'utf-8', options?: any) {
      const normalized = String(label || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (normalized === 'latin1' || normalized === 'iso88591' || normalized === 'binary') {
        this.encoding = 'latin1';
        this.decoder = null;
      } else if (NativeTextDecoder) {
        try {
          this.decoder = new NativeTextDecoder(label, options);
          this.encoding = this.decoder.encoding || 'utf-8';
        } catch {
          this.decoder = new NativeTextDecoder('utf-8', options);
          this.encoding = 'utf-8';
        }
      } else {
        this.encoding = 'utf-8';
        this.decoder = null;
      }
    }

    decode(input?: BufferSource, options?: any): string {
      if (this.encoding === 'latin1' && input) {
        const bytes = input instanceof Uint8Array ? input : new Uint8Array(input as ArrayBuffer);
        let str = '';
        for (let i = 0; i < bytes.length; i++) {
          str += String.fromCharCode(bytes[i]);
        }
        return str;
      }
      return this.decoder ? this.decoder.decode(input, options) : '';
    }
  };
}
