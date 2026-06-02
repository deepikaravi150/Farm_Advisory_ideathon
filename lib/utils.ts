import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function extractCentroid(coordinates: Array<{ lat: number; lng: number }>): { lat: number; lng: number } {
  const lat = coordinates.reduce((s, c) => s + c.lat, 0) / coordinates.length;
  const lng = coordinates.reduce((s, c) => s + c.lng, 0) / coordinates.length;
  return { lat, lng };
}
