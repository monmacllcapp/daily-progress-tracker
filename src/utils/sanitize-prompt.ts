/**
 * Prompt Sanitization Utility
 *
 * Prevents prompt injection attacks by escaping delimiters and filtering
 * potentially malicious patterns from user-controlled text before embedding
 * in AI prompts.
 */

/**
 * Sanitize user-controlled text before embedding in AI prompts.
 * Prevents prompt injection by escaping delimiters and truncating.
 *
 * @param input - The user-controlled text to sanitize
 * @param maxLength - Maximum length to allow (default: 500)
 * @returns Sanitized text safe for prompt embedding
 */
export function sanitizeForPrompt(input: string, maxLength = 500): string {
  if (!input) return '';
  return input
    .replace(/```/g, '\\`\\`\\`')           // Escape code blocks
    .replace(/\[SYSTEM\b/gi, '[FILTERED')    // Block system prompt overrides
    .replace(/\[INST\b/gi, '[FILTERED')      // Block instruction overrides
    .replace(/IGNORE\s+(ALL\s+)?(PREVIOUS|ABOVE|PRIOR)\s+(INSTRUCTIONS?|PROMPTS?)/gi, '[FILTERED]')
    .replace(/<\/?(?:system|user|assistant|human|claude)\b[^>]*>/gi, '[FILTERED]') // Block role tags
    .slice(0, maxLength)
    .trim();
}

/**
 * Sanitize and wrap in delimiters for safer prompt embedding.
 *
 * @param label - Field name/label for the user data
 * @param input - The user-controlled text to sanitize
 * @param maxLength - Maximum length to allow (default: 500)
 * @returns Sanitized text wrapped in XML-style delimiters
 */
export function quotedUserInput(label: string, input: string, maxLength = 500): string {
  const sanitized = sanitizeForPrompt(input, maxLength);
  return `<user_data field="${label}">${sanitized}</user_data>`;
}
