'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { ChevronDown, ChevronUp, Trash2, Check, Pencil } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

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

interface StoreEntryProps {
  store: Store;
  onUpdate: (store: Store) => Promise<void>;
  onDelete: (storeId: number) => Promise<void>;
  onAddEmployee: (storeId: number) => Promise<void>;
  onUpdateEmployee: (storeId: number, employee: Employee) => Promise<void>;
  onDeleteEmployee: (storeId: number, employeeId: number) => Promise<void>;
  onConfirm: (store: Store) => Promise<void>;
  onConfirmEmployee: (storeId: number, employee: Employee) => Promise<void>;
}

export function StoreEntry({ store, onUpdate, onDelete, onAddEmployee, onUpdateEmployee, onDeleteEmployee, onConfirm, onConfirmEmployee }: StoreEntryProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isStoreEditable, setIsStoreEditable] = useState(false);
  const [editableEmployees, setEditableEmployees] = useState<Record<number, boolean>>({});
  const [employeeErrors, setEmployeeErrors] = useState<Record<number, { name?: string; phone?: string }>>({});

  const handleStoreNameChange = (name: string) => {
    onUpdate({ ...store, name });
  };

  const handleStoreConfirm = async () => {
    // TODO: Implement database update
    console.log('Updating store in database:', store);
    setIsStoreEditable(false);
    await onConfirm(store);
  };

  const handleStoreEdit = () => {
    setIsStoreEditable(true);
  };

  const handleAddEmployee = async (storeId: number) => {
    // No need to set editableEmployees here; handled by useEffect
  };

  const validateEmployee = (employee: Employee) => {
    const errors: { name?: string; phone?: string } = {};
    if (!employee.name.trim()) {
      errors.name = 'Name is required';
    }
    if (!employee.telegramPhoneNumber.trim()) {
      errors.phone = 'Phone number is required';
    }
    return errors;
  };

  const handleEmployeeConfirm = async (employeeId: number) => {
    const employee = store.employees.find(emp => emp.id === employeeId);
    if (employee) {
      const errors = validateEmployee(employee);
      if (Object.keys(errors).length > 0) {
        setEmployeeErrors(prev => ({ ...prev, [employeeId]: errors }));
        return;
      }
      // TODO: Implement database update
      console.log('Updating employee in database:', employee);
      setEditableEmployees(prev => ({ ...prev, [employeeId]: false }));
      setEmployeeErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[employeeId];
        return newErrors;
      });
      
      // Update the employee with isDataConfirmed set to true
      handleEmployeeUpdate(employeeId, { isDataConfirmed: true });
      await onConfirmEmployee(store.id, employee);
    }
  };

  const handleEmployeeEdit = (employeeId: number) => {
    setEditableEmployees(prev => ({ ...prev, [employeeId]: true }));
  };

  const handleEmployeeDelete = (employeeId: number) => {
    onUpdate({
      ...store,
      employees: store.employees.filter(emp => emp.id !== employeeId),
    });
    setEditableEmployees(prev => {
      const newState = { ...prev };
      delete newState[employeeId];
      return newState;
    });
  };

  const handleSendTelegramMessage = async (employee: Employee) => {
    // TODO: Implement Telegram bot message sending
    console.log('Sending Telegram message to:', employee.telegramPhoneNumber);
  };

  const handleEmployeeUpdate = (employeeId: number, updates: Partial<Employee>) => {
    const updatedEmployees = store.employees.map(emp => {
      if (emp.id === employeeId) {
        if (updates.isManager) {
          return { ...emp, ...updates, isManager: true };
        }
        return { ...emp, ...updates };
      }
      if (updates.isManager && emp.isManager) {
        return { ...emp, isManager: false };
      }
      return emp;
    });

    onUpdate({ ...store, employees: updatedEmployees });
    
    // Clear errors when field is updated
    if (updates.name || updates.telegramPhoneNumber) {
      setEmployeeErrors(prev => {
        const newErrors = { ...prev };
        if (updates.name) delete newErrors[employeeId]?.name;
        if (updates.telegramPhoneNumber) delete newErrors[employeeId]?.phone;
        return newErrors;
      });
    }
  };

  useEffect(() => {
    // Set editable state for any new employee with a negative id
    store.employees.forEach(emp => {
      if (emp.id < 0 && editableEmployees[emp.id] !== true) {
        setEditableEmployees(prev => ({ ...prev, [emp.id]: true }));
      }
    });
    // eslint-disable-next-line
  }, [store.employees]);

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 flex-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? <ChevronUp /> : <ChevronDown />}
            </Button>
            <Input
              placeholder="Store Name"
              value={store.name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleStoreNameChange(e.target.value)}
              className="max-w-md"
              disabled={!isStoreEditable}
            />
            <Button
              variant={isStoreEditable ? "default" : "outline"}
              size="icon"
              onClick={isStoreEditable ? handleStoreConfirm : handleStoreEdit}
            >
              {isStoreEditable ? <Check className="h-5 w-5" /> : <Pencil className="h-5 w-5" />}
            </Button>
          </div>
          <Button
            variant="destructive"
            size="icon"
            onClick={() => onDelete(store.id)}
          >
            <Trash2 className="h-5 w-5" />
          </Button>
        </div>

        {isExpanded && (
          <div className="space-y-4 pl-8">
            {store.employees.map((employee) => (
              <div key={employee.id} className="flex flex-col lg:flex-row lg:items-center gap-4 p-4 border rounded-lg">
                <div className="flex flex-col lg:flex-row items-start lg:items-center gap-4 flex-1 min-w-0">
                  <div className="space-y-1 w-full lg:w-auto min-w-0">
                    <Input
                      placeholder="Employee Name"
                      value={employee.name}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        handleEmployeeUpdate(employee.id, { name: e.target.value })
                      }
                      className={`w-full lg:w-64 ${employeeErrors[employee.id]?.name ? 'border-red-500' : ''}`}
                      disabled={!editableEmployees[employee.id]}
                    />
                    {employeeErrors[employee.id]?.name && (
                      <p className="text-xs text-red-500">{employeeErrors[employee.id].name}</p>
                    )}
                  </div>
                  <div className="space-y-1 w-full lg:w-auto min-w-0">
                    <Input
                      placeholder="Telegram Mobile Number"
                      value={employee.telegramPhoneNumber}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        handleEmployeeUpdate(employee.id, {
                          telegramPhoneNumber: e.target.value,
                        })
                      }
                      className={`w-full lg:w-48 ${employeeErrors[employee.id]?.phone ? 'border-red-500' : ''}`}
                      disabled={!editableEmployees[employee.id]}
                    />
                    {employeeErrors[employee.id]?.phone && (
                      <p className="text-xs text-red-500">{employeeErrors[employee.id].phone}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm whitespace-nowrap">Store Manager</span>
                    <Switch
                      checked={employee.isManager}
                      onCheckedChange={(checked: boolean) =>
                        handleEmployeeUpdate(employee.id, { isManager: checked })
                      }
                      disabled={!editableEmployees[employee.id]}
                    />
                  </div>
                  <Button
                    variant={editableEmployees[employee.id] ? "default" : "outline"}
                    size="icon"
                    onClick={editableEmployees[employee.id] 
                      ? () => handleEmployeeConfirm(employee.id)
                      : () => handleEmployeeEdit(employee.id)
                    }
                    className="shrink-0"
                  >
                    {editableEmployees[employee.id] 
                      ? <Check className="h-5 w-5" />
                      : <Pencil className="h-5 w-5" />
                    }
                  </Button>
                </div>
                <div className="flex items-center gap-2 mt-2 lg:mt-0 shrink-0">
                  {/* <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          onClick={() => handleSendTelegramMessage(employee)}
                          disabled={!employee.telegramPhoneNumber || employee.hasConfirmed}
                          className="whitespace-nowrap w-full lg:w-auto"
                        >
                          Onboard
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Our agent sends an onboarding message via Telegram</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider> */}
                  <Button
                    variant="destructive"
                    size="icon"
                    onClick={() => onDeleteEmployee(store.id, employee.id)}
                    className="shrink-0"
                  >
                    <Trash2 className="h-5 w-5" />
                  </Button>
                </div>
              </div>
            ))}
            <Button onClick={() => onAddEmployee(store.id)} variant="outline">
              Add Employee
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
} 