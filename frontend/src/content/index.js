/**
 * Unified Content Script Entry Point
 * Bundles legacy scanner and ghost text logic into a single file.
 */

import '../../services/ghost_text.js';
import '../../event_injector.js';
import '../../scanner.js';

console.log('[LazyFill] Content script (React Bundle) initialized.');
