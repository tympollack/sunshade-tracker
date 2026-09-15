/**
 * Consolidated clipboard copy helper with verified fallback and error handling.
 * Resolves DEV-TRK PR-38 review comments regarding duplicate clipboard logic and unverified legacy execCommand.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    } else if (typeof document !== 'undefined') {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      textArea.style.left = '-9999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      return !!successful;
    }
    return false;
  } catch (err) {
    console.error('Failed to copy to clipboard', err);
    return false;
  }
}
