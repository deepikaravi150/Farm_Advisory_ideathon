import { getRequestConfig } from 'next-intl/server';

export const locales = ['en', 'hi', 'ta'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'en';

export default getRequestConfig(async ({ locale }) => ({
  messages: (await import(`../public/locales/${locale}/common.json`)).default,
}));
