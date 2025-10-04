export function bufferToBlob(buffer: Buffer) {
  return new Blob([buffer as Uint8Array<ArrayBuffer>]);
}

export async function blobToBuffer(blob: Blob | Promise<Blob>) {
  const resolveBlob = await blob;
  const arrayBuffer = await resolveBlob.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
