/**
 * ============================================================
 *  ERROR CORE — Shared Constants and Classification logic
 * ============================================================
 */

export const SEVERITY = Object.freeze({
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
});

export const CATEGORY = Object.freeze({
  API_ERROR: 'API_ERROR',
  RATE_LIMIT: 'RATE_LIMIT',
  NETWORK: 'NETWORK_ERROR',
  STORAGE: 'STORAGE_ERROR',
  VALIDATION: 'VALIDATION_ERROR',
  AUTH: 'AUTH_ERROR',
  INTERNAL: 'INTERNAL_ERROR',
  UNKNOWN: 'UNKNOWN_ERROR',
});

/**
 * Classify an error from the Google AI API response.
 */
export function classifyApiError(statusCode, body) {
  const detail = body?.error?.message || JSON.stringify(body).slice(0, 200);

  if (statusCode === 429) {
    return {
      category: CATEGORY.RATE_LIMIT,
      severity: SEVERITY.MEDIUM,
      userMessage: 'API rate limit reached. Please wait a moment and try again.',
      detail,
    };
  }

  if (statusCode === 401 || statusCode === 403) {
    return {
      category: CATEGORY.AUTH,
      severity: SEVERITY.HIGH,
      userMessage: 'Invalid or expired API key. Please update your key in Settings.',
      detail,
    };
  }

  if (statusCode === 400) {
    return {
      category: CATEGORY.VALIDATION,
      severity: SEVERITY.MEDIUM,
      userMessage: 'The AI request was malformed. Try rescanning the page.',
      detail,
    };
  }

  if (statusCode >= 500) {
    return {
      category: CATEGORY.API_ERROR,
      severity: SEVERITY.HIGH,
      userMessage: 'Google AI is experiencing issues. Please try again later.',
      detail,
    };
  }

  if (statusCode === 0 || statusCode === undefined) {
    return {
      category: CATEGORY.NETWORK,
      severity: SEVERITY.HIGH,
      userMessage: 'Network error. Check your internet connection.',
      detail,
    };
  }

  return {
    category: CATEGORY.UNKNOWN,
    severity: SEVERITY.MEDIUM,
    userMessage: `Unexpected error (code ${statusCode}). Check the extension logs.`,
    detail,
  };
}
