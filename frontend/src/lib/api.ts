/**
 * Next.js standard API configuration
 * Uses built-in environment handling instead of custom URL construction
 */

// Get API base from Next.js environment
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '/api';

/**
 * Build API URL using Next.js standards
 * This respects basePath and environment configuration automatically
 */
export function getApiUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `${API_BASE}/${cleanPath}`;
}

/**
 * Get absolute API URL (for popups, OAuth redirects, etc.)
 */
export function getAbsoluteApiUrl(path: string): string {
  if (typeof window === 'undefined') {
    // Server-side: return relative
    return getApiUrl(path);
  }
  
  const apiUrl = getApiUrl(path);
  
  // If API_BASE is already absolute, use it
  if (API_BASE.startsWith('http')) {
    return apiUrl;
  }
  
  // Otherwise, make it absolute with current origin
  return `${window.location.origin}${apiUrl}`;
}