'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StoreEntry } from '@/components/admin/StoreEntry';
import { OnboardingSummary } from '@/components/admin/OnboardingSummary';
import { supabase } from '@/utils/supabase';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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

let tempStoreId = -1;
let tempEmployeeId = -1;

export function AdminOnboarding() {
  const [stores, setStores] = useState<Store[]>([]);
  const [deleteStoreDialogOpen, setDeleteStoreDialogOpen] = useState(false);
  const [deleteEmployeeDialogOpen, setDeleteEmployeeDialogOpen] = useState(false);
  const [storeToDelete, setStoreToDelete] = useState<number | null>(null);
  const [employeeToDelete, setEmployeeToDelete] = useState<{ storeId: number; employeeId: number } | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      const { data: storeData, error: storeError } = await supabase
        .from('stores')
        .select('*')
        .is('deleted_at', null);
      if (storeError) return;
      const { data: employeeData, error: employeeError } = await supabase
        .from('employees')
        .select('*')
        .is('deleted_at', null);
      if (employeeError) return;
      const storesWithEmployees = (storeData || []).map(store => ({
        id: store.id,
        name: store.store_name,
        employees: (employeeData || [])
          .filter(emp => emp.store_id === store.id)
          .map(emp => ({
            id: emp.id,
            name: emp.employee_name,
            isManager: emp.store_manager,
            telegramPhoneNumber: emp.mobile_number,
            hasConfirmed: false,
            isDataConfirmed: true,
          })),
      }));
      setStores(storesWithEmployees);
    };
    fetchData();
  }, []);

  // Add Store (local only)
  const handleAddStore = () => {
    setStores([
      ...stores,
      { id: tempStoreId--, name: '', employees: [] },
    ]);
  };

  // Confirm Store (insert or update in Supabase)
  const handleStoreConfirm = async (store: Store) => {
    if (store.id < 0) {
      // Insert new store
      const { data, error } = await supabase
        .from('stores')
        .insert([{ store_name: store.name }])
        .select()
        .single();
      if (error || !data) return;
      setStores(stores.map(s =>
        s.id === store.id ? { ...store, id: data.id } : s
      ));
    } else {
      // Update existing store
      await supabase
        .from('stores')
        .update({ store_name: store.name })
        .eq('id', store.id);
      setStores(stores.map(s =>
        s.id === store.id ? { ...store } : s
      ));
    }
  };

  // Delete Store (and its employees)
  const handleStoreDelete = async (storeId: number) => {
    setStoreToDelete(storeId);
    setDeleteStoreDialogOpen(true);
  };

  const confirmStoreDelete = async () => {
    const storeId = storeToDelete;
    if (!storeId) return;

    const store = stores.find(s => s.id === storeId);
    if (!store) return;
    
    if (storeId > 0) {
      // Soft delete all employees in the store
      await supabase
        .from('employees')
        .update({ deleted_at: new Date().toISOString() })
        .eq('store_id', storeId);
      
      // Soft delete the store
      await supabase
        .from('stores')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', storeId);
    }
    
    // Update local state to remove the store
    setStores(stores.filter(store => store.id !== storeId));
    setDeleteStoreDialogOpen(false);
    setStoreToDelete(null);
  };

  // Add Employee (local only)
  const handleAddEmployee = async (storeId: number) => {
    setStores(stores.map(store =>
      store.id === storeId
        ? {
            ...store,
            employees: [
              ...store.employees,
              {
                id: tempEmployeeId--,
                name: '',
                isManager: false,
                telegramPhoneNumber: '',
                hasConfirmed: false,
                isDataConfirmed: false,
              },
            ],
          }
        : store
    ));
  };

  // Confirm Employee (insert or update in Supabase)
  const handleEmployeeConfirm = async (storeId: number, employee: Employee) => {
    if (employee.id < 0) {
      // Insert new employee
      const { data, error } = await supabase
        .from('employees')
        .insert([
          {
            employee_name: employee.name,
            mobile_number: employee.telegramPhoneNumber,
            store_manager: employee.isManager,
            store_id: storeId,
          },
        ])
        .select()
        .single();
      if (error || !data) return;
      setStores(stores.map(store =>
        store.id === storeId
          ? {
              ...store,
              employees: store.employees.map(emp =>
                emp.id === employee.id
                  ? { ...employee, id: data.id, isDataConfirmed: true }
                  : emp
              ),
            }
          : store
      ));
    } else {
      // Update existing employee
      await supabase
        .from('employees')
        .update({
          employee_name: employee.name,
          mobile_number: employee.telegramPhoneNumber,
          store_manager: employee.isManager,
        })
        .eq('id', employee.id);
      setStores(stores.map(store =>
        store.id === storeId
          ? {
              ...store,
              employees: store.employees.map(emp =>
                emp.id === employee.id
                  ? { ...employee, isDataConfirmed: true }
                  : emp
              ),
            }
          : store
      ));
    }
  };

  // Delete Employee
  const handleEmployeeDelete = async (storeId: number, employeeId: number) => {
    setEmployeeToDelete({ storeId, employeeId });
    setDeleteEmployeeDialogOpen(true);
  };

  const confirmEmployeeDelete = async () => {
    const { storeId, employeeId } = employeeToDelete || {};
    if (!storeId || !employeeId) return;

    const store = stores.find(s => s.id === storeId);
    if (!store) return;

    if (employeeId > 0) {
      const { error } = await supabase
        .from('employees')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', employeeId);
      
      if (error) {
        alert('Failed to delete employee: ' + error.message);
        console.error('Supabase update error:', error);
        return;
      }
    }

    // Update local state to remove the employee
    setStores(stores.map(store =>
      store.id === storeId
        ? {
            ...store,
            employees: store.employees.filter(emp => emp.id !== employeeId),
          }
        : store
    ));
    setDeleteEmployeeDialogOpen(false);
    setEmployeeToDelete(null);
  };

  // Update Store (local only, for typing)
  const handleStoreUpdate = async (updatedStore: Store) => {
    setStores(stores.map(store =>
      store.id === updatedStore.id ? updatedStore : store
    ));
  };

  // Update Employee (local only, for typing)
  const handleEmployeeUpdate = async (storeId: number, updatedEmployee: Employee) => {
    setStores(stores.map(store =>
      store.id === storeId
        ? {
            ...store,
            employees: store.employees.map(emp =>
              emp.id === updatedEmployee.id ? updatedEmployee : emp
            ),
          }
        : store
    ));
  };

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-8">Onboarding</h1>
      
      <div className="space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>Store and Employee Management</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stores.map(store => (
                <StoreEntry
                  key={store.id}
                  store={store}
                  onUpdate={handleStoreUpdate}
                  onDelete={handleStoreDelete}
                  onAddEmployee={handleAddEmployee}
                  onUpdateEmployee={handleEmployeeUpdate}
                  onDeleteEmployee={handleEmployeeDelete}
                  onConfirm={handleStoreConfirm}
                  onConfirmEmployee={handleEmployeeConfirm}
                />
              ))}
              <Button onClick={handleAddStore} className="w-full">
                Add New Store
              </Button>
            </div>
          </CardContent>
        </Card>

        <OnboardingSummary stores={stores} />
      </div>

      <AlertDialog open={deleteStoreDialogOpen} onOpenChange={setDeleteStoreDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Store</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the store? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No, please cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmStoreDelete} className="bg-red-600 hover:bg-red-700">
              Yes, please proceed
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteEmployeeDialogOpen} onOpenChange={setDeleteEmployeeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Employee</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the employee information? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No, please cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmEmployeeDelete} className="bg-red-600 hover:bg-red-700">
              Yes, please proceed
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
} 