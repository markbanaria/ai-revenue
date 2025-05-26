'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, XCircle, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface Employee {
  id: number;
  name: string;
  isManager: boolean;
  telegramPhoneNumber: string;
  hasConfirmed: boolean;
  isDataConfirmed: boolean;
  telegram_onboard_token?: string;
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
  const [copiedStates, setCopiedStates] = useState<Record<number, boolean>>({});
  const [generatedLinks, setGeneratedLinks] = useState<Record<number, string>>({});

  const handleGenerateLink = async (employee: Employee) => {
    try {
      const response = await fetch('/api/generate-onboard-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ employeeId: employee.id }),
      });

      if (!response.ok) throw new Error('Failed to generate token');

      const data = await response.json();
      const link = `https://t.me/DepositChecker_bot?start=${data.token}`;
      setGeneratedLinks(prev => ({ ...prev, [employee.id]: link }));
    } catch (error) {
      console.error('Error generating link:', error);
    }
  };

  const handleCopyLink = async (employeeId: number) => {
    const link = generatedLinks[employeeId];
    if (!link) return;

    try {
      await navigator.clipboard.writeText(link);
      setCopiedStates(prev => ({ ...prev, [employeeId]: true }));
      setTimeout(() => {
        setCopiedStates(prev => ({ ...prev, [employeeId]: false }));
      }, 2000);
    } catch (error) {
      console.error('Error copying link:', error);
    }
  };

  const confirmedEmployees = stores.flatMap(store =>
    store.employees
      .filter(emp => emp.isDataConfirmed)
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
                <div className="flex flex-col items-end gap-2">
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
                  {!employee.hasConfirmed && (
                    <div className="flex flex-col items-end gap-1">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => generatedLinks[employee.id] 
                                ? handleCopyLink(employee.id)
                                : handleGenerateLink(employee)
                              }
                              className="whitespace-nowrap"
                            >
                              {copiedStates[employee.id] ? (
                                <>
                                  <Check className="h-4 w-4 mr-1" />
                                  Link Copied
                                </>
                              ) : generatedLinks[employee.id] ? (
                                <>
                                  <Copy className="h-4 w-4 mr-1" />
                                  Copy Link
                                </>
                              ) : (
                                'Generate Telegram Invite'
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Generate a unique Telegram onboarding link</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      {generatedLinks[employee.id] && (
                        <p className="text-xs text-muted-foreground max-w-[200px] truncate">
                          {generatedLinks[employee.id]}
                        </p>
                      )}
                    </div>
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