/**
 * Barcode & QR Code Scanning Engine
 * Uses native BarcodeDetector API when available (Chrome / Android / modern Edge)
 * Falls back to @zxing/browser on iOS / Safari / unsupported browsers.
 */

export interface ParsedScanResult {
  raw: string;
  type: 'gate_arrival' | 'machine' | 'part' | 'unknown';
  arrivalCode?: {
    site_id: string;
    window: number;
    signature: string;
  };
  machineId?: string;
  partResource?: string;
}

/**
 * Checks if native BarcodeDetector is available
 */
export function hasNativeBarcodeDetector(): boolean {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window;
}

/**
 * Parses raw decoded string into structured domain object
 */
export function parseScanResult(rawText: string): ParsedScanResult {
  const trimmed = rawText.trim();

  // 1. Try parsing Gate Arrival Code JSON: {"site_id":"site-a","window":123456,"signature":"..."}
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.site_id && parsed.signature && typeof parsed.window === 'number') {
        return {
          raw: trimmed,
          type: 'gate_arrival',
          arrivalCode: {
            site_id: parsed.site_id,
            window: parsed.window,
            signature: parsed.signature,
          },
        };
      }
    } catch {
      // not JSON
    }
  }

  // 2. Machine QR code: M-104, M-102, etc.
  if (/^M-\d+/i.test(trimmed)) {
    return {
      raw: trimmed,
      type: 'machine',
      machineId: trimmed.toUpperCase(),
    };
  }

  // 3. Part barcode: HS-40, ORING-2, VLV-01, etc.
  if (/^[A-Za-z0-9_-]+$/.test(trimmed)) {
    return {
      raw: trimmed,
      type: 'part',
      partResource: trimmed,
    };
  }

  return {
    raw: trimmed,
    type: 'unknown',
  };
}

/**
 * Scans an HTML video or canvas element using native BarcodeDetector or @zxing/browser fallback
 */
export async function scanFromMediaElement(
  element: HTMLVideoElement | HTMLCanvasElement
): Promise<ParsedScanResult | null> {
  // Strategy A: Native BarcodeDetector
  if (hasNativeBarcodeDetector()) {
    try {
      const BarcodeDetectorClass = (window as any).BarcodeDetector;
      const detector = new BarcodeDetectorClass({
        formats: ['qr_code', 'code_128', 'ean_13', 'code_39', 'data_matrix'],
      });
      const detected = await detector.detect(element);
      if (detected && detected.length > 0 && detected[0].rawValue) {
        return parseScanResult(detected[0].rawValue);
      }
    } catch (err) {
      console.warn('[RIVET] Native BarcodeDetector error, trying fallback:', err);
    }
  }

  // Strategy B: @zxing/browser fallback (e.g. on iOS Safari)
  try {
    const { BrowserMultiFormatReader } = await import('@zxing/browser');
    const reader = new BrowserMultiFormatReader();

    if (element instanceof HTMLCanvasElement) {
      const result = reader.decodeFromCanvas(element);
      if (result && result.getText()) {
        return parseScanResult(result.getText());
      }
    } else if (element instanceof HTMLVideoElement) {
      // Create a canvas snapshot of the video frame to decode
      const canvas = document.createElement('canvas');
      canvas.width = element.videoWidth || 640;
      canvas.height = element.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(element, 0, 0, canvas.width, canvas.height);
        const result = reader.decodeFromCanvas(canvas);
        if (result && result.getText()) {
          return parseScanResult(result.getText());
        }
      }
    }
  } catch {
    // Decoding didn't find a barcode in this frame
  }

  return null;
}

/**
 * Scans from an image URL or Blob
 */
export async function scanFromImageUrl(imageUrl: string): Promise<ParsedScanResult | null> {
  // Strategy A: Native BarcodeDetector with Image element
  if (hasNativeBarcodeDetector()) {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = imageUrl;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      const BarcodeDetectorClass = (window as any).BarcodeDetector;
      const detector = new BarcodeDetectorClass({
        formats: ['qr_code', 'code_128', 'ean_13', 'code_39', 'data_matrix'],
      });
      const detected = await detector.detect(img);
      if (detected && detected.length > 0 && detected[0].rawValue) {
        return parseScanResult(detected[0].rawValue);
      }
    } catch (err) {
      console.warn('[RIVET] Native image BarcodeDetector fallback:', err);
    }
  }

  // Strategy B: @zxing/browser fallback
  try {
    const { BrowserMultiFormatReader } = await import('@zxing/browser');
    const reader = new BrowserMultiFormatReader();
    const result = await reader.decodeFromImageUrl(imageUrl);
    if (result && result.getText()) {
      return parseScanResult(result.getText());
    }
  } catch (err) {
    console.warn('[RIVET] ZXing image decode failed:', err);
  }

  return null;
}
