import { useState, useEffect } from 'react';

/**
 * Custom hook to sync state with chrome.storage.local
 * @param {string} key - The storage key
 * @param {any} initialValue - Default value if not found
 */
export function useChromeStorage(key, initialValue) {
  const [state, setState] = useState(initialValue);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Load initial value from storage
    chrome.storage.local.get([key], (result) => {
      if (result[key] !== undefined) {
        setState(result[key]);
      }
      setIsLoaded(true);
    });

    // Listen for changes from other parts of the extension
    const listener = (changes, area) => {
      if (area === 'local' && changes[key]) {
        setState(changes[key].newValue);
      }
    };

    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [key]);

  const setStorageState = (value) => {
    const valueToStore = value instanceof Function ? value(state) : value;
    setState(valueToStore);
    chrome.storage.local.set({ [key]: valueToStore });
  };

  return [state, setStorageState, isLoaded];
}
