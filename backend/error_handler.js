/**
 * ============================================================
 *  ERROR HANDLER — Centralized Error Interception Module
 * ============================================================
 *  Captures, formats, and gracefully handles all errors across
 *  the extension: API failures, rate limits, missing data, etc.
 * ============================================================
 */

import db from '../database/db_adapter.js';

/* Error Severity Levels */
const SEVERITY = Object.freeze({
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
});

/* Known Error Categories */
const CATEGORY = Object.freeze({
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
 * Classify an error from the Gemini API response.
 * @param {number} statusCode
 * @param {Object} body
 * @returns {{ category: string, severity: string, userMessage: string }}
 */
function classifyApiError(statusCode, body) {
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
      userMessage: 'Google Gemini is experiencing issues. Please try again later.',
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

/**
 * Handle and log an error, returning a user-safe response.
 * @param {Error|Object} error
 * @param {string}       [context]  — e.g. "ai_controller.generateFill"
 * @returns {Promise<{ success: false, error: Object }>}
 */
async function handleError(error, context = 'unknown') {
  let classified;

  if (error?.statusCode !== undefined) {
    classified = classifyApiError(error.statusCode, error.body);
  } else if (error instanceof TypeError && error.message?.includes('Failed to fetch')) {
    classified = {
      category: CATEGORY.NETWORK,
      severity: SEVERITY.HIGH,
      userMessage: 'Network error. Check your internet connection.',
      detail: error.message,
    };
  } else {
    classified = {
      category: CATEGORY.INTERNAL,
      severity: SEVERITY.MEDIUM,
      userMessage: 'An internal error occurred. The extension will attempt to recover.',
      detail: error?.message || String(error),
    };
  }

  // Persist the log entry (non-blocking, fire-and-forget)
  try {
    await db.appendLog({
      context,
      ...classified,
      stack: error?.stack || null,
    });
  } catch (_) {
    // Storage itself failed — silently ignore to avoid infinite loop
    console.error('[LazyFill ErrorHandler] Failed to persist log:', _);
  }

  console.warn(`[LazyFill] ${classified.category} in ${context}:`, classified.detail);

  return {
    success: false,
    error: {
      category: classified.category,
      severity: classified.severity,
      message: classified.userMessage,
    },
  };
}

/**
 * Wrap an async function with automatic error handling.
 * @param {Function} fn
 * @param {string}   context
 * @returns {Function}
 */
function withErrorBoundary(fn, context) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (err) {
      return handleError(err, context);
    }
  };
}

export { handleError, withErrorBoundary, classifyApiError, SEVERITY, CATEGORY };
