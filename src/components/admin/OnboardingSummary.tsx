'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, XCircle } from 'lucide-react';

interface Employee {
  id: number;
  name: string;
  isManager: boolean;
  telegramPhoneNumber: string;
  hasConfirmed: boolean;
  isDataConfirmed: boolean;
}

interface Store {
  id: number;
  name: string;
  employees: Employee[];
}

interface OnboardingSummaryProps {
  stores: Store[];
}

export function OnboardingSummary({ stores }: OnboardingSummaryProps) {
  const confirmedEmployees = stores.flatMap(store =>
    store.employees
      .filter(emp => emp.isDataConfirmed)  // Only show employees whose data has been confirmed
      .map(emp => ({
        storeName: store.name,
        ...emp,
      }))
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Employees Onboarding Status</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {confirmedEmployees.length === 0 ? (
            <p className="text-muted-foreground">No confirmed employees yet.</p>
          ) : (
            confirmedEmployees.map(employee => (
              <div
                key={employee.id}
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">{employee.name}</h3>
                    {employee.isManager && (
                      <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                        Store Manager
                      </span>
                    )}
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-sm text-muted-foreground">
                      Telegram: {employee.telegramPhoneNumber}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Store: {employee.storeName}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {employee.hasConfirmed ? (
                    <>
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                      <span className="text-sm text-green-500">Onboarded</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-5 w-5 text-red-500" />
                      <span className="text-sm text-red-500">Not Onboarded</span>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
} 