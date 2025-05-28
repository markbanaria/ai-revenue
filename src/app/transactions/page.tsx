'use client';

import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addWeeks, addMonths, subMonths } from "date-fns";
import { formatInTimeZone } from 'date-fns-tz';
import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { TransactionHistory } from '@/components/TransactionHistory';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const PERIODS = [
    { label: "All Time", value: "all" },
    { label: "Day", value: "day" },
    { label: "Week", value: "week" },
    { label: "Month", value: "month" },
];

export default function TransactionsPage() {
    const [transactions, setTransactions] = useState<any[]>([]);
    const [stores, setStores] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [period, setPeriod] = useState("all");
    const [selectedDay, setSelectedDay] = useState(() => format(new Date(), "yyyy-MM-dd"));
    const [selectedWeek, setSelectedWeek] = useState(() => {
        const now = new Date();
        const weekStart = startOfWeek(now, { weekStartsOn: 0 });
        return format(weekStart, "yyyy-MM-dd");
    });
    const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), "yyyy-MM"));
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
    const [selectedTransactions, setSelectedTransactions] = useState<Set<string>>(new Set());
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

    // Generate week options for the past 12 weeks
    const weekOptions = Array.from({ length: 12 }).map((_, i) => {
        const now = new Date();
        const weekStart = startOfWeek(addWeeks(now, -i), { weekStartsOn: 0 });
        const weekEnd = endOfWeek(addWeeks(now, -i), { weekStartsOn: 0 });
        return {
            label: `${formatInTimeZone(weekStart, 'Asia/Manila', "MMM d")}–${formatInTimeZone(weekEnd, 'Asia/Manila', "MMM d, yyyy")}`,
            value: format(weekStart, "yyyy-MM-dd"),
        };
    });

    // Generate month options for the past 12 months
    const monthOptions = Array.from({ length: 12 }).map((_, i) => {
        const monthDate = subMonths(new Date(), i);
        return {
            label: formatInTimeZone(monthDate, 'Asia/Manila', "MMMM yyyy"),
            value: format(monthDate, "yyyy-MM"),
        };
    });

    useEffect(() => {
        // When period changes to "week", ensure selectedWeek is set
        if (period === "week" && !selectedWeek) {
            const now = new Date();
            const weekStart = startOfWeek(now, { weekStartsOn: 0 });
            setSelectedWeek(format(weekStart, "yyyy-MM-dd"));
        }
        // eslint-disable-next-line
    }, [period]);

    useEffect(() => {
        async function fetchData() {
            setLoading(true);

            // Fetch stores
            const { data: storesData } = await supabase.from("stores").select("id,store_name");
            const storeMap: Record<string, string> = {};
            storesData?.forEach((s: any) => { storeMap[s.id] = s.store_name; });
            setStores(storeMap);

            // Date filter
            let fromDate: Date | null = null, toDate: Date | null = null;
            if (period === "day") {
                fromDate = new Date(selectedDay);
                fromDate.setHours(0, 0, 0, 0);
                toDate = new Date(selectedDay);
                toDate.setHours(23, 59, 59, 999);
            } else if (period === "week") {
                const weekDate = selectedWeek ? new Date(selectedWeek) : startOfWeek(new Date(), { weekStartsOn: 0 });
                fromDate = startOfWeek(weekDate, { weekStartsOn: 0 });
                toDate = endOfWeek(weekDate, { weekStartsOn: 0 });
            } else if (period === "month") {
                const [year, month] = selectedMonth.split("-");
                fromDate = startOfMonth(new Date(Number(year), Number(month) - 1));
                toDate = endOfMonth(new Date(Number(year), Number(month) - 1));
            }
            // For "all", don't set fromDate/toDate

            let query = supabase.from("transactions").select("*").is("deleted_at", null);
            if (period !== "all") {
                const isoFrom = fromDate!.toISOString();
                const isoTo = toDate!.toISOString();
                query = query
                    .gte("created_at", isoFrom)
                    .lte("created_at", isoTo);
            }
            query = query.order("created_at", { ascending: false });

            const { data: txData, error } = await query;
            if (!error) setTransactions(txData || []);
            setLoading(false);
        }
        fetchData();
    // eslint-disable-next-line
    }, [period, selectedDay, selectedWeek, selectedMonth]);

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            const allIds = new Set(transactions.map(tx => tx.id));
            setSelectedTransactions(allIds);
        } else {
            setSelectedTransactions(new Set());
        }
    };

    const handleSelectTransaction = (id: string, checked: boolean) => {
        const newSelected = new Set(selectedTransactions);
        if (checked) {
            newSelected.add(id);
        } else {
            newSelected.delete(id);
        }
        setSelectedTransactions(newSelected);
    };

    const handleDelete = async () => {
        const selectedIds = Array.from(selectedTransactions);
        const { error } = await supabase
            .from('transactions')
            .update({ deleted_at: new Date().toISOString() })
            .in('id', selectedIds);

        if (!error) {
            setTransactions(transactions.filter(tx => !selectedIds.includes(tx.id)));
            setSelectedTransactions(new Set());
            setDeleteDialogOpen(false);
        }
    };

    return (
        <div className="container mx-auto py-8">
            <h1 className="text-3xl font-bold mb-8">Transactions</h1>
            <Card>
                <CardHeader>
                    <CardTitle>Transaction History</CardTitle>
                </CardHeader>
                <CardContent>
                    <TransactionHistory
                        transactions={transactions}
                        stores={stores}
                        period={period}
                        selectedDay={selectedDay}
                        selectedWeek={selectedWeek}
                        selectedMonth={selectedMonth}
                        sortConfig={sortConfig}
                        selectedTransactions={selectedTransactions}
                        onPeriodChange={setPeriod}
                        onDayChange={setSelectedDay}
                        onWeekChange={setSelectedWeek}
                        onMonthChange={setSelectedMonth}
                        onSort={(key) => {
                            let direction: 'asc' | 'desc' = 'asc';
                            if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
                                direction = 'desc';
                            }
                            setSortConfig({ key, direction });
                        }}
                        onSelectAll={handleSelectAll}
                        onSelectTransaction={handleSelectTransaction}
                        onDelete={() => setDeleteDialogOpen(true)}
                    />
                </CardContent>
            </Card>

            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will delete the selected transactions. This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}