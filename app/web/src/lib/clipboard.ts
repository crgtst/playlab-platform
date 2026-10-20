/** Writes text to the clipboard. Rejects when the Clipboard API is missing or permission is denied. */
export async function copyText(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) throw new Error('Copying is not supported in this browser');
  await navigator.clipboard.writeText(text);
}
