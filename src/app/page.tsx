'use client';

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function Home() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTransactions() {
      const { data, error } = await supabase.from("transactions").select("*");
      if (!error) setTransactions(data || []);
      setLoading(false);
    }
    fetchTransactions();
  }, []);

  return (
    <div className="grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-geist-sans)]">
      <h1 className="text-2xl font-bold">Transactions</h1>
      {loading ? (
        <p>Loading...</p>
      ) : (
        <table className="min-w-full border">
          <thead>
            <tr>
              {transactions[0] &&
                Object.keys(transactions[0]).map((key) => (
                  <th key={key} className="border px-2 py-1">{key}</th>
                ))}
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx, idx) => (
              <tr key={tx.id || idx}>
                {Object.values(tx).map((val, i) => (
                  <td key={i} className="border px-2 py-1">{String(val)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}