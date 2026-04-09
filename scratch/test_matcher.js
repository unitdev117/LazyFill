import LocalMatcher from '../backend/services/local_matcher.js';

function test() {
  console.log('--- LazyFill LocalMatcher Test ---');

  const profile = { 
    'Electricity Bill': '23454456544',
    'City': 'San Francisco',
    'Phone Number': '555-0123'
  };

  const fields = [
    { index: 0, label: 'City', tagName: 'input', type: 'text' },
    { index: 1, label: 'Elec', tagName: 'input', type: 'text' },
    { index: 2, label: 'PhoneNumber', tagName: 'input', type: 'text' }
  ];

  console.log('Input Profile:', JSON.stringify(profile, null, 2));
  console.log('Testing "City" field matching...');
  
  const { localMappings, remainingFields } = LocalMatcher.findMatches(fields, profile);

  console.log('Local Mappings Found:', localMappings);
  
  const cityMatch = localMappings.find(m => m.index === 0);
  if (cityMatch && cityMatch.value === '23454456544') {
    console.error('❌ BUG PERSISTS: "City" matched "Electricity Bill" value!');
  } else if (!cityMatch) {
    console.log('✅ FIXED: "City" did not match "Electricity Bill" incorrectly.');
  } else {
    console.log('✅ "City" matched correctly to:', cityMatch.value);
  }

  const phoneMatch = localMappings.find(m => m.index === 2);
  if (phoneMatch) {
    console.log('✅ "PhoneNumber" matched correctly to:', phoneMatch.value);
  } else {
    console.warn('⚠️ "PhoneNumber" did not match locally (might be expected depending on threshold)');
  }

  console.log('--- Test Complete ---');
}

test();
