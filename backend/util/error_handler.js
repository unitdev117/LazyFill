/**
 * ============================================================
 *  BACKEND ERROR HANDLER — Server-side logging only
 * ============================================================
 */

import { SEVERITY, CATEGORY, classifyApiError } from './error_core.js';

/**
 * Handle and log an error, returning a user-safe response.
 */
export async function handleError(error, context = 'unknown') {
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
      userMessage: 'An internal error occurred.',
      detail: error?.message || String(error),
    };
  }

  // On the backend, we just log to the console/server logs
  // No chrome.storage/db logging here.
  console.warn(`[LazyFill Backend] ${classified.category} in ${context}:`, classified.detail);

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
 */
export function withErrorBoundary(fn, context) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (err) {
      return handleError(err, context);
    }
  };
}

export { SEVERITY, CATEGORY, classifyApiError };
