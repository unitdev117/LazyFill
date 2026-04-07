/**
 * Unified Content Script Entry Point
 * Bundles legacy scanner and ghost text logic into a single file.
 */

import './ui/ghost_text.js';
import './injector/main.js';
import './scanner/observer.js';
import './scanner/main.js';

console.log('[LazyFill] Content script (React Bundle) initialized.');
