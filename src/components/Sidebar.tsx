'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export function Sidebar() {
  const pathname = usePathname();

  const routes = [
    {
      href: '/',
      label: 'Dashboard',
    },
    {
      href: '/transactions',
      label: 'Transactions',
    },
    {
      href: '/onboarding',
      label: 'Onboarding Status',
    },
    {
      href: '/stores',
      label: 'Store and Employee Management',
    },
  ];

  return (
    <div className="w-64 bg-gray-50 border-r h-screen p-4">
      <div className="mb-8">
        <h1 className="text-xl font-bold">Daily Detox</h1>
      </div>
      <nav className="space-y-2">
        {routes.map((route) => (
          <Link
            key={route.href}
            href={route.href}
            className={cn(
              'block px-4 py-2 rounded-md text-sm font-medium',
              pathname === route.href
                ? 'bg-gray-100 text-gray-900'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            )}
          >
            {route.label}
          </Link>
        ))}
      </nav>
    </div>
  );
} 