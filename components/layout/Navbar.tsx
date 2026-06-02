'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Sprout, LogOut, User, LayoutDashboard, Leaf, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import LanguageSwitcher from './LanguageSwitcher';

interface NavbarProps { farmerName?: string; }

export default function Navbar({ farmerName }: NavbarProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const t = useTranslations('nav');

  async function logout() {
    await fetch('/api/auth/login', { method: 'DELETE' });
    router.push('/');
  }

  const links = [
    { href: '/dashboard', label: t('dashboard'), icon: LayoutDashboard },
    { href: '/crop-plan', label: t('cropPlan'), icon: Leaf },
    { href: '/profile', label: t('profile'), icon: User },
  ];

  return (
    <nav className="bg-brand-700 text-white shadow-lg sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-16">
        <Link href="/dashboard" className="flex items-center gap-2 font-bold text-xl">
          <Sprout className="w-7 h-7 text-brand-200" />
          <span className="hidden sm:block">FarmAdvisor</span>
        </Link>
        <div className="hidden md:flex items-center gap-6">
          {links.map(l => (
            <Link key={l.href} href={l.href} className="flex items-center gap-1.5 text-sm hover:text-brand-200 transition-colors">
              <l.icon className="w-4 h-4" />{l.label}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          {farmerName && <span className="hidden sm:block text-sm text-brand-200">{farmerName}</span>}
          <button onClick={logout} className="flex items-center gap-1 text-sm hover:text-red-300 transition-colors">
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:block">{t('logout')}</span>
          </button>
          <button className="md:hidden" onClick={() => setOpen(!open)}>
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>
      {open && (
        <div className="md:hidden bg-brand-800 px-4 pb-4 flex flex-col gap-3">
          {links.map(l => (
            <Link key={l.href} href={l.href} className="flex items-center gap-2 py-2 text-sm hover:text-brand-200" onClick={() => setOpen(false)}>
              <l.icon className="w-4 h-4" />{l.label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}
