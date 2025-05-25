'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-8">Dashboard</h1>
      
      <div className="grid gap-6 md:grid-cols-2">
        <Link href="/transactions">
          <Card className="hover:bg-gray-50 transition-colors">
            <CardHeader>
              <CardTitle>Transactions</CardTitle>
            </CardHeader>
            <CardContent>
              <p>View and manage all transactions</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/onboarding">
          <Card className="hover:bg-gray-50 transition-colors">
            <CardHeader>
              <CardTitle>Onboarding</CardTitle>
            </CardHeader>
            <CardContent>
              <p>Manage stores and employees</p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}