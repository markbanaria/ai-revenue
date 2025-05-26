'use client';

import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addWeeks, addMonths, subMonths } from "date-fns";
import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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

            let query = supabase.from("transactions").select("*");
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

	const requestSort = (key: string) => {
		let direction: 'asc' | 'desc' = 'asc';
		if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
			direction = 'desc';
		}
		setSortConfig({ key, direction });
	};

	// Calculate total (assuming 'amount' column)
	const total = mappedTx.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);

	// Sort the transactions
	const sortedTransactions = sortData(mappedTx);

	return (
		<div className="container mx-auto py-8">
			<h1 className="text-3xl font-bold mb-8">Transactions</h1>
			<div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4 gap-4">
				<div className="flex items-center gap-2">
					<label className="font-medium">Period:</label>
					<select
						className="border rounded px-2 py-1"
						value={period}
						onChange={e => setPeriod(e.target.value)}
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
							onChange={e => setSelectedDay(e.target.value)}
						/>
					)}
					{period === "week" && (
						<select
							className="border rounded px-2 py-1"
							value={selectedWeek || weekOptions[0].value}
							onChange={e => setSelectedWeek(e.target.value)}
						>
							{weekOptions.map(opt => (
								<option key={opt.value} value={opt.value}>{opt.label}</option>
							))}
						</select>
					)}
					{period === "month" && (
						<select
							className="border rounded px-2 py-1"
							value={selectedMonth}
							onChange={e => setSelectedMonth(e.target.value)}
						>
							{monthOptions.map(opt => (
								<option key={opt.value} value={opt.value}>{opt.label}</option>
							))}
						</select>
					)}
				</div>
				<div className="text-lg font-semibold">
					Total: <span className="text-green-600">₱{total.toLocaleString()}</span>
				</div>
			</div>
			<Card>
				<CardHeader>
					<CardTitle>Transaction History</CardTitle>
				</CardHeader>
				<CardContent>
					{loading ? (
						<p>Loading...</p>
					) : (
						<div className="overflow-x-auto">
							<table className="min-w-full border">
								<thead>
									<tr>
										{columns.map(key => (
											<th 
												key={key} 
												className="border px-4 py-2 text-left bg-gray-100 cursor-pointer hover:bg-gray-200"
												onClick={() => requestSort(key)}
											>
												<div className="flex items-center gap-2">
													{key.replace('_', ' ').toUpperCase()}
													{sortConfig?.key === key && (
														<span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
													)}
												</div>
											</th>
										))}
									</tr>
								</thead>
								<tbody>
									{sortedTransactions.map((tx, idx) => (
										<tr key={tx.date + idx} className="hover:bg-gray-50">
											{columns.map((col, i) => (
												<td key={i} className="border px-4 py-2">
													{col === 'amount' 
														? `₱${Number(tx[col]).toLocaleString()}`
														: ["date", "created_at"].includes(col)
															? format(new Date(tx[col]), "MMM dd yyyy")
															: String(tx[col])
													}
												</td>
											))}
										</tr>
									))}
								</tbody>
							</table>
							{sortedTransactions.length === 0 && (
								<div className="text-center text-gray-500 py-8">No transactions found for this period.</div>
							)}
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}