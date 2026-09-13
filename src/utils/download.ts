import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { audioService } from '@/services/audioService';

/**
 * Download a single file by triggering a browser download action.
 */
export async function downloadSingleFile(storagePath: string, preferredFilename: string) {
  try {
    const url = await audioService.getPlaybackUrl(storagePath, 3600);
    const response = await fetch(url);
    const blob = await response.blob();
    saveAs(blob, preferredFilename);
  } catch (error) {
    console.error('Failed to download file:', error);
    throw new Error('Could not download file. It may have been removed.');
  }
}

/**
 * Downloads multiple audio files from storage and packages them into a ZIP file.
 * 
 * @param files Array of { storagePath, filename }
 * @param zipFilename The output name of the ZIP file
 */
export async function downloadBulkZip(
  files: { storagePath: string; filename: string }[],
  zipFilename: string
) {
  const zip = new JSZip();
  let addedCount = 0;

  for (const file of files) {
    try {
      const url = await audioService.getPlaybackUrl(file.storagePath, 3600);
      const response = await fetch(url);
      
      if (!response.ok) {
        console.warn(`Failed to fetch ${file.filename}: ${response.status}`);
        continue;
      }
      
      const blob = await response.blob();
      zip.file(file.filename, blob);
      addedCount++;
    } catch (error) {
      console.warn(`Failed to process ${file.filename} for zip:`, error);
    }
  }

  if (addedCount === 0) {
    throw new Error('No files could be downloaded. They may have been deleted or expired.');
  }

  const content = await zip.generateAsync({ type: 'blob' });
  saveAs(content, zipFilename);
}
