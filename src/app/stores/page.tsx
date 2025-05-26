'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StoreEntry } from '@/components/admin/StoreEntry';
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

export default function StoresPage() {
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
            hasConfirmed: emp.telegram_bot_confirmed === true && emp.telegram_id !== null,
            isDataConfirmed: true,
          })),
      }));
      setStores(storesWithEmployees);
    };
    fetchData();
  }, []);

  const handleAddStore = () => {
    setStores([
      ...stores,
      { id: tempStoreId--, name: '', employees: [] },
    ]);
  };

  const handleStoreConfirm = async (store: Store) => {
    if (store.id < 0) {
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
      await supabase
        .from('stores')
        .update({ store_name: store.name })
        .eq('id', store.id);
      setStores(stores.map(s =>
        s.id === store.id ? { ...store } : s
      ));
    }
  };

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
      await supabase
        .from('employees')
        .update({ deleted_at: new Date().toISOString() })
        .eq('store_id', storeId);
      
      await supabase
        .from('stores')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', storeId);
    }
    
    setStores(stores.filter(store => store.id !== storeId));
    setDeleteStoreDialogOpen(false);
    setStoreToDelete(null);
  };

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

  const handleEmployeeConfirm = async (storeId: number, employee: Employee) => {
    if (employee.id < 0) {
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

  const handleStoreUpdate = async (updatedStore: Store) => {
    setStores(stores.map(store =>
      store.id === updatedStore.id ? updatedStore : store
    ));
  };

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
      <h1 className="text-3xl font-bold mb-8">Store and Employee Management</h1>
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Stores</CardTitle>
            <Button onClick={handleAddStore}>Add Store</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {stores.map((store) => (
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
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={deleteStoreDialogOpen} onOpenChange={setDeleteStoreDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the store and all its employees. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmStoreDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteEmployeeDialogOpen} onOpenChange={setDeleteEmployeeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the employee. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmEmployeeDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
} 