import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Ghép className có điều kiện và loại bỏ class Tailwind xung đột (class sau thắng). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
