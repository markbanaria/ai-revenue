'use client';

import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addWeeks, subMonths } from "date-fns";
import { formatInTimeZone } from 'date-fns-tz';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
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

const PERIODS = [
  { label: "All Time", value: "all" },
  { label: "Day", value: "day" },
  { label: "Week", value: "week" },
  { label: "Month", value: "month" },
];

interface TransactionHistoryProps {
  transactions: any[];
  stores: Record<string, string>;
  period: string;
  selectedDay: string;
  selectedWeek: string;
  selectedMonth: string;
  sortConfig: { key: string; direction: 'asc' | 'desc' } | null;
  selectedTransactions: Set<string>;
  onPeriodChange: (period: string) => void;
  onDayChange: (day: string) => void;
  onWeekChange: (week: string) => void;
  onMonthChange: (month: string) => void;
  onSort: (key: string) => void;
  onSelectAll: (checked: boolean) => void;
  onSelectTransaction: (id: string, checked: boolean) => void;
  onDelete: () => void;
}

export function TransactionHistory({
  transactions,
  stores,
  period,
  selectedDay,
  selectedWeek,
  selectedMonth,
  sortConfig,
  selectedTransactions,
  onPeriodChange,
  onDayChange,
  onWeekChange,
  onMonthChange,
  onSort,
  onSelectAll,
  onSelectTransaction,
  onDelete,
}: TransactionHistoryProps) {
  // Generate week options for the past 12 weeks
  const weekOptions = Array.from({ length: 12 }).map((_, i) => {
    const now = new Date();
    const weekStart = startOfWeek(addWeeks(now, -i), { weekStartsOn: 0 });
    const weekEnd = endOfWeek(addWeeks(now, -i), { weekStartsOn: 0 });
    return {
      label: `${format(weekStart, "MMM d")}–${format(weekEnd, "MMM d, yyyy")}`,
      value: format(weekStart, "yyyy-MM-dd"),
    };
  });

  // Generate month options for the past 12 months
  const monthOptions = Array.from({ length: 12 }).map((_, i) => {
    const monthDate = subMonths(new Date(), i);
    return {
      label: format(monthDate, "MMMM yyyy"),
      value: format(monthDate, "yyyy-MM"),
    };
  });

  // Columns to show (excluding id, sender_id, deleted_at, store_id)
  const visibleColumns = transactions[0]
    ? Object.keys(transactions[0]).filter(
      key => !["id", "sender_id", "deleted_at", "store_id"].includes(key)
    )
    : [];

  // Add store_name as first column and ensure created_at is last
  const columns = ["store_name", ...visibleColumns.filter(col => col !== 'created_at'), 'created_at'];

  // Map transactions to include store_name
  const mappedTx = transactions.map(tx => ({
    ...tx,
    store_name: stores[tx.store_id] || tx.store_id
  }));

  // Add sorting function
  const sortData = (data: any[]) => {
    if (!sortConfig) return data;

    return [...data].sort((a, b) => {
      let aValue = a[sortConfig.key];
      let bValue = b[sortConfig.key];

      // Handle special cases for different column types
      if (sortConfig.key === 'amount') {
        aValue = Number(aValue) || 0;
        bValue = Number(bValue) || 0;
      } else if (['date', 'created_at'].includes(sortConfig.key)) {
        aValue = new Date(aValue).getTime();
        bValue = new Date(bValue).getTime();
      } else {
        aValue = String(aValue).toLowerCase();
        bValue = String(bValue).toLowerCase();
      }

      if (aValue < bValue) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  };

  // Calculate total (assuming 'amount' column)
  const total = mappedTx.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);

  // Sort the transactions
  const sortedTransactions = sortData(mappedTx);

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4">
        <div className="flex items-center gap-4 min-h-[40px]">
          <div className="flex items-center gap-2">
            <label className="font-medium">Period:</label>
            <select
              className="border rounded px-2 py-1"
              value={period}
              onChange={e => onPeriodChange(e.target.value)}
            >
              {PERIODS.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
            {period === "day" && (
              <input
                type="date"
                className="border rounded px-2 py-1"
                value={selectedDay}
                onChange={e => onDayChange(e.target.value)}
              />
            )}
            {period === "week" && (
              <select
                className="border rounded px-2 py-1"
                value={selectedWeek || weekOptions[0].value}
                onChange={e => onWeekChange(e.target.value)}
              >
                {weekOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            )}
            {period === "month" && (
              <select
                className="border rounded px-2 py-1"
                value={selectedMonth || monthOptions[0].value}
                onChange={e => onMonthChange(e.target.value)}
              >
                {monthOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            )}
          </div>
          {selectedTransactions.size > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Selected
            </Button>
          )}
        </div>
        <div className="text-lg font-semibold">
          Total: ₱{total.toFixed(2)}
        </div>
      </div>

      <div className="overflow-x-auto mt-4">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-50">
              <th className="p-2 text-left">
                <input
                  type="checkbox"
                  checked={selectedTransactions.size === sortedTransactions.length}
                  onChange={e => onSelectAll(e.target.checked)}
                  className="rounded border-gray-300"
                />
              </th>
              {columns.map(column => (
                <th
                  key={column}
                  className="p-2 text-left cursor-pointer hover:bg-gray-100"
                  onClick={() => onSort(column)}
                >
                  {column.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                  {sortConfig?.key === column && (
                    <span className="ml-1">
                      {sortConfig.direction === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedTransactions.map(tx => (
              <tr key={tx.id} className="border-t hover:bg-gray-50">
                <td className="p-2">
                  <input
                    type="checkbox"
                    checked={selectedTransactions.has(tx.id)}
                    onChange={e => onSelectTransaction(tx.id, e.target.checked)}
                    className="rounded border-gray-300"
                  />
                </td>
                {columns.map(column => (
                  <td key={column} className="p-2">
                    {column === 'created_at' || column === 'date'
                      ? formatInTimeZone(new Date(tx[column]), 'Asia/Manila', 'MMM d, yyyy h:mm a')
                      : column === 'amount'
                        ? `₱${Number(tx[column]).toFixed(2)}`
                        : tx[column]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
} 