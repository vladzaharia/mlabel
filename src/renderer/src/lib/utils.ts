import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind class names, de-duplicating conflicts. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export const isMac = (): boolean => globalThis.window?.platform === "darwin";
export const isWindows = (): boolean => globalThis.window?.platform === "win32";

/**
 * Horizontal padding that keeps chrome-bar content clear of the platform's
 * window controls (macOS traffic lights left, Windows overlay buttons right).
 */
export function chromePadding(): string {
  return isMac() ? "pl-24 pr-2" : isWindows() ? "pl-5 pr-36" : "pl-5 pr-3";
}

/** Trailing-edge debounce. */
export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  ms: number,
): (...args: A) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
