/**
 * ============================================================
 *  FRONTEND ERROR HANDLER — Extension-side logging
 * ============================================================
 */

import { SEVERITY, CATEGORY, classifyApiError } from '../../../backend/util/error_core.js';
import db from '../../../backend/database/db_adapter.js';

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
    console.error('[LazyFill FrontEnd ErrorHandler] Failed to persist log:', _);
  }

  console.warn(`[LazyFill FrontEnd] ${classified.category} in ${context}:`, classified.detail);

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
