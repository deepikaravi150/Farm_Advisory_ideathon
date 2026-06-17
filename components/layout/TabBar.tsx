'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ClipboardCheck, Sprout, MessageCircle, IndianRupee, User, type LucideIcon } from 'lucide-react';

interface Tab {
  href: string;
  key: 'today' | 'plan' | 'chat' | 'money' | 'profile';
  icon: LucideIcon;
  center?: boolean;
}

const TABS: Tab[] = [
  { href: '/today', key: 'today', icon: ClipboardCheck },
  { href: '/plan', key: 'plan', icon: Sprout },
  { href: '/chat', key: 'chat', icon: MessageCircle, center: true },
  { href: '/money', key: 'money', icon: IndianRupee },
  { href: '/profile', key: 'profile', icon: User },
];

export default function TabBar() {
  const pathname = usePathname();
  const t = useTranslations('tabs');

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md border-t border-gray-200 bg-white/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      <ul className="flex items-stretch justify-around px-2">
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          const Icon = tab.icon;

          if (tab.center) {
            return (
              <li key={tab.href} className="relative flex-1">
                <Link
                  href={tab.href}
                  aria-label={t(tab.key)}
                  className="flex flex-col items-center"
                >
                  <span
                    className={`-mt-5 flex h-14 w-14 items-center justify-center rounded-full shadow-lg ring-4 ring-white transition-colors ${
                      active ? 'bg-brand-600' : 'bg-brand-500'
                    }`}
                  >
                    <Icon className="h-6 w-6 text-white" strokeWidth={2.2} />
                  </span>
                  <span className={`pb-1.5 text-[11px] font-medium ${active ? 'text-brand-700' : 'text-gray-500'}`}>
                    {t(tab.key)}
                  </span>
                </Link>
              </li>
            );
          }

          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-label={t(tab.key)}
                className={`flex flex-col items-center gap-1 py-2.5 transition-colors ${
                  active ? 'text-brand-700' : 'text-gray-400'
                }`}
              >
                <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 2} />
                <span className="text-[11px] font-medium">{t(tab.key)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
