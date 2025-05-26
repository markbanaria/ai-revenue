'use client';

import { OnboardingSummary } from '@/components/admin/OnboardingSummary';

export default function OnboardingPage() {
  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-8">Onboarding Status</h1>
      <OnboardingSummary />
    </div>
  );
} 