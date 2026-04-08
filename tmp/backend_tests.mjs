
/**
 * ============================================================
 *  BACKEND TEST LAB — Optimization Service Verification
 * ============================================================
 *  This script runs unit tests on your new backend services
 *  to ensure the logic is perfect before browser deployment.
 * ============================================================
 */

import FieldFilter from '../backend/services/field_filter.js';
import LocalMatcher from '../backend/services/local_matcher.js';

// --- MOCK DATA ---
const mockProfileFields = {
  'Email': 'tester@example.com',
  'First Name': 'John',
  'Zip Code': '90210'
};

const mockScannedFields = [
  { index: 0, id: 'user_email', name: 'email', currentValue: '', tagName: 'INPUT' },     // Should Match Locally
  { index: 1, id: 'first_name', name: 'fname', currentValue: '', tagName: 'INPUT' },      // Should Match Locally
  { index: 2, id: 'bio', name: 'biography', currentValue: 'Hello!', tagName: 'TEXTAREA' }, // Should be FILTERED (already filled)
  { index: 3, id: 'custom_field', name: 'random', currentValue: '', tagName: 'INPUT' }     // Should go to AI
];

console.log('--- STARTING BACKEND INTEGRITY TEST ---\n');

// 1. Test FieldFilter
console.log('[1/2] Testing FieldFilter...');
const emptyFields = FieldFilter.clean(mockScannedFields);
console.log(` > Input: ${mockScannedFields.length} fields`);
console.log(` > Output: ${emptyFields.length} fields (Expected 3)`);
if (emptyFields.length === 3 && !emptyFields.find(f => f.index === 2)) {
  console.log(' ✅ SUCCESS: Already-filled "Bio" field was successfully excluded.');
} else {
  console.log(' ❌ FAIL: FieldFilter did not remove the filled field.');
}

console.log('');

// 2. Test LocalMatcher
console.log('[2/2] Testing LocalMatcher...');
const { localMappings, remainingFields } = LocalMatcher.findMatches(emptyFields, mockProfileFields);

console.log(` > Local Matches Found: ${localMappings.length} (Expected 2: Email and First Name)`);
console.log(` > Remaining for AI: ${remainingFields.length} (Expected 1: custom_field)`);

const hasEmail = localMappings.find(m => m.value === 'tester@example.com');
const hasFirstName = localMappings.find(m => m.value === 'John');

if (hasEmail && hasFirstName && remainingFields.length === 1) {
  console.log(' ✅ SUCCESS: LocalMatcher identified "email" and "fname" correctly.');
} else {
  console.log(' ❌ FAIL: LocalMatcher missed a mapping or failed to separate AI fields.');
}

console.log('\n--- TEST COMPLETE ---');
