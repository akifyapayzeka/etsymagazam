import JSZip from "jszip";

export interface ZipEntry {
  filename: string;
  data: Buffer;
}

export async function buildZip(entries: ZipEntry[]): Promise<Buffer> {
  const zip = new JSZip();
  for (const entry of entries) {
    zip.file(entry.filename, entry.data);
  }
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

/** Validates that a buffer is a structurally valid, openable ZIP (used by the QA agent). */
export async function isValidZip(buffer: Buffer): Promise<boolean> {
  try {
    const zip = await JSZip.loadAsync(buffer);
    return Object.keys(zip.files).length > 0;
  } catch {
    return false;
  }
}
