import { Transform } from 'class-transformer';
import { escapeHtml } from '../sanitization.utils';

/**
 * Decorator transformer para class-transformer que aplica escape preventivo de caracteres HTML.
 * Converte caracteres perigosos como < e > para suas respectivas entidades seguras (&lt; e &gt;).
 */
export function SanitizeText() {
  return Transform(({ value }) => {
    if (typeof value === 'string') {
      return escapeHtml(value.trim());
    }
    return value;
  });
}
