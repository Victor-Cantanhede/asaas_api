/**
 * Utilitários de sanitização e proteção contra XSS (Cross-Site Scripting).
 */

const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
};

const DANGEROUS_PATTERNS = [
  /<[^>]*>/, // Qualquer tag HTML, como <script>, <img>, <iframe>
  /[<>]/, // Caracteres pontuais de abertura e fechamento de tag
  /javascript\s*:/i, // Esquema javascript pseudo-protocol
  /vbscript\s*:/i,
  /on\w+\s*=/i, // Manipuladores de eventos como onload=, onerror=, onclick=
  /data\s*:\s*text\/html/i,
];

/**
 * Escapa caracteres HTML perigosos convertendo-os em entidades HTML seguras.
 */
export function escapeHtml(value?: string): string {
  if (!value || typeof value !== 'string') {
    return '';
  }
  return value.replace(/[&<>"'/]/g, (char) => HTML_ENTITIES[char] || char);
}

/**
 * Remove tags HTML completas de uma string.
 */
export function stripHtmlTags(value?: string): string {
  if (!value || typeof value !== 'string') {
    return '';
  }
  return value.replace(/<[^>]*>/g, '').trim();
}

/**
 * Verifica se uma string contém tags HTML, scripts ou caracteres perigosos (< e >).
 */
export function containsHtmlOrScript(value?: string): boolean {
  if (!value || typeof value !== 'string') {
    return false;
  }
  return DANGEROUS_PATTERNS.some((pattern) => pattern.test(value));
}
