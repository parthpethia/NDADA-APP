import * as ImageManipulator from 'expo-image-manipulator';
import { PDFDocument } from 'pdf-lib';

export interface OptimizationResult {
  uri: string;
  name: string;
  blob: Blob;
  originalSize: number;
  optimizedSize: number;
  reductionPercentage: number;
  optimized: boolean;
}

/**
 * Validates file sizes against strict limits and optimizes them based on file type.
 * Ensures zero disruption via robust fallbacks in case of processing errors.
 *
 * @param file Object containing uri and name of the file
 * @param isPhoto Boolean indicating if the file is the applicant photograph
 * @returns Promise resolving to an OptimizationResult object
 */
export async function validateAndOptimizeFile(
  file: { uri: string; name: string },
  isPhoto: boolean
): Promise<OptimizationResult> {
  const fileName = file.name;
  const lowercaseName = fileName.toLowerCase();
  const isPdf = lowercaseName.endsWith('.pdf');
  const isPng = lowercaseName.endsWith('.png');
  
  // 1. Fetch file to determine original size and obtain Blob
  let originalBlob: Blob;
  try {
    const response = await fetch(file.uri);
    originalBlob = await response.blob();
  } catch (err) {
    console.error(`[Storage Optimization] Failed to fetch file ${fileName}:`, err);
    throw new Error(`Could not read file: ${fileName}. Please ensure the file is valid.`);
  }

  const originalSize = originalBlob.size;
  const originalSizeMB = originalSize / (1024 * 1024);

  // 2. Validate strict size limits
  if (isPhoto) {
    if (originalSize > 10 * 1024 * 1024) {
      throw new Error(`Applicant photograph "${fileName}" exceeds the 10 MB limit (${originalSizeMB.toFixed(2)} MB).`);
    }
  } else if (isPdf) {
    if (originalSize > 25 * 1024 * 1024) {
      throw new Error(`PDF document "${fileName}" exceeds the 25 MB limit (${originalSizeMB.toFixed(2)} MB).`);
    }
  } else {
    // Other supporting documents (images)
    if (originalSize > 20 * 1024 * 1024) {
      throw new Error(`Supporting document "${fileName}" exceeds the 20 MB limit (${originalSizeMB.toFixed(2)} MB).`);
    }
  }

  console.log(`[Storage Optimization] Initial check for ${fileName}: Size = ${originalSizeMB.toFixed(2)} MB`);

  // Define fallback result (original upload unchanged)
  const fallbackResult = (optimized: boolean = false): OptimizationResult => ({
    uri: file.uri,
    name: fileName,
    blob: originalBlob,
    originalSize,
    optimizedSize: originalSize,
    reductionPercentage: 0,
    optimized,
  });

  // 3. Perform Optimization with defensive Try-Catch blocks
  try {
    if (isPhoto) {
      // Applicant photograph - Always JPEG format, max 600px width/height, 0.75 quality
      console.log(`[Storage Optimization] Optimizing applicant photograph: ${fileName}`);
      const result = await ImageManipulator.manipulateAsync(
        file.uri,
        [{ resize: { width: 600, height: 600 } }], // Bounds to max 600px preserving aspect ratio
        {
          compress: 0.75,
          format: ImageManipulator.SaveFormat.JPEG,
        }
      );
      
      const optResponse = await fetch(result.uri);
      const optBlob = await optResponse.blob();
      const optimizedSize = optBlob.size;
      const reduction = ((originalSize - optimizedSize) / originalSize) * 100;

      console.log(
        `[Storage Optimization] Photograph optimized successfully:\n` +
        `- Original: ${originalSize} bytes\n` +
        `- Optimized: ${optimizedSize} bytes\n` +
        `- Reduction: ${reduction.toFixed(2)}%`
      );

      return {
        uri: result.uri,
        name: fileName.replace(/\.[^/.]+$/, "") + ".jpg", // Force JPEG extension
        blob: optBlob,
        originalSize,
        optimizedSize,
        reductionPercentage: Math.max(0, reduction),
        optimized: true,
      };
    } else if (isPdf) {
      // PDF optimization threshold check: only optimize if > 1 MB
      if (originalSize <= 1 * 1024 * 1024) {
        console.log(`[Storage Optimization] PDF ${fileName} is <= 1 MB. Uploading original without optimization.`);
        return fallbackResult(false);
      }

      console.log(`[Storage Optimization] Optimizing PDF: ${fileName}`);
      
      // Load PDF via pdf-lib and re-save using Object Streams
      const pdfBytes = await originalBlob.arrayBuffer();
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const optimizedPdfBytes = await pdfDoc.save({
        useObjectStreams: true,
      });

      const optBlob = new Blob([optimizedPdfBytes as any], { type: 'application/pdf' });
      const optimizedSize = optBlob.size;
      const reduction = ((originalSize - optimizedSize) / originalSize) * 100;

      console.log(
        `[Storage Optimization] PDF optimized successfully:\n` +
        `- Original: ${originalSize} bytes\n` +
        `- Optimized: ${optimizedSize} bytes\n` +
        `- Reduction: ${reduction.toFixed(2)}%`
      );

      return {
        uri: file.uri,
        name: fileName,
        blob: optBlob,
        originalSize,
        optimizedSize,
        reductionPercentage: Math.max(0, reduction),
        optimized: true,
      };
    } else {
      // Document scan (images) - Preserve format (JPEG or PNG) to prevent text artifacts
      console.log(`[Storage Optimization] Optimizing document scan image: ${fileName}`);
      const format = isPng ? ImageManipulator.SaveFormat.PNG : ImageManipulator.SaveFormat.JPEG;
      
      const actions = [{ resize: { width: 1600, height: 1600 } }]; // Max 1600px preserving aspect ratio
      const saveOptions = {
        compress: isPng ? 1.0 : 0.7, // PNG is lossless, JPEG is compressed at 0.7
        format,
      };

      const result = await ImageManipulator.manipulateAsync(file.uri, actions, saveOptions);
      
      const optResponse = await fetch(result.uri);
      const optBlob = await optResponse.blob();
      const optimizedSize = optBlob.size;
      const reduction = ((originalSize - optimizedSize) / originalSize) * 100;

      console.log(
        `[Storage Optimization] Document image optimized successfully:\n` +
        `- Format: ${isPng ? 'PNG' : 'JPEG'}\n` +
        `- Original: ${originalSize} bytes\n` +
        `- Optimized: ${optimizedSize} bytes\n` +
        `- Reduction: ${reduction.toFixed(2)}%`
      );

      return {
        uri: result.uri,
        name: fileName,
        blob: optBlob,
        originalSize,
        optimizedSize,
        reductionPercentage: Math.max(0, reduction),
        optimized: true,
      };
    }
  } catch (err) {
    // Robust fail-safe fallback: log the warning and return the original, unprocessed file
    console.error(`[Storage Optimization] Error encountered while optimizing ${fileName}. Falling back to original.`, err);
    return fallbackResult(false);
  }
}
