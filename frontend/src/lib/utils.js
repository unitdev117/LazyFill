import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges CSS classes with tailwind-merge to avoid conflicts.
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
