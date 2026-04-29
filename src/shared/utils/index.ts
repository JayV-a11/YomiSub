/**
 * Conditional logger — always logs so runtime issues can be diagnosed.
 * Uses import.meta.env.DEV provided by Vite.
 */
export function logger(...args: unknown[]): void {
  console.log('[YomiSub]', ...args)
}

/**
 * Debounces a function. The wrapped function's return value is discarded
 * (intentional — used for fire-and-forget event handlers).
 */
export function debounce<TArgs extends unknown[]>(
  fn: (...args: TArgs) => unknown,
  delay: number,
): (...args: TArgs) => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  return (...args: TArgs): void => {
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      fn(...args)
    }, delay)
  }
}

/**
 * Clamps a number between min and max (inclusive).
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * Escapes HTML special characters to prevent XSS when inserting into innerHTML.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
