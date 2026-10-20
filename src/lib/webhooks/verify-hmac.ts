import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyHmacSignature(
  payloadRaw: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader || !secret) return false;

  const cleanHeader = signatureHeader.replace(/^sha256=/, '').trim();
  const expectedSignature = createHmac('sha256', secret).update(payloadRaw).digest('hex');

  if (cleanHeader.length !== expectedSignature.length) return false;

  try {
    return timingSafeEqual(
      Buffer.from(cleanHeader, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch {
    return false;
  }
}
