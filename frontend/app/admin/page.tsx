"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/api";

type Usage = Awaited<ReturnType<typeof api.adminUsage>>;

export default function AdminPage() {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.adminUsage()
      .then(setUsage)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load admin usage"));
  }, []);

  return (
    <AppShell>
      <header className="page-header">
        <div>
          <h1 className="page-title">Admin usage</h1>
          <div className="muted">Usage analytics, costs, failures, and limit monitoring.</div>
        </div>
      </header>
      {error ? <p className="error">{error}</p> : null}
      {!usage && !error ? <div className="empty-state">Loading admin dashboard...</div> : null}
      {usage ? (
        <>
          <section className="stats">
            <div className="stat"><div className="muted">Total users</div><div className="stat-value">{usage.total_users}</div></div>
            <div className="stat"><div className="muted">Active users</div><div className="stat-value">{usage.active_users}</div></div>
            <div className="stat"><div className="muted">Generations</div><div className="stat-value">{usage.total_generations}</div></div>
            <div className="stat"><div className="muted">Failed</div><div className="stat-value">{usage.failed_generations}</div></div>
            <div className="stat"><div className="muted">Gemini cost</div><div className="stat-value">${usage.estimated_gemini_cost.toFixed(2)}</div></div>
          </section>
          <UsageTable title="Generations by user" headers={["User", "Email", "Count"]} rows={usage.generations_by_user.map((row) => [row.user, row.email, row.count])} />
          <UsageTable title="Generations by department" headers={["Department", "Count"]} rows={usage.generations_by_department.map((row) => [row.department, row.count])} />
          <UsageTable
            title="Users near limit"
            headers={["User", "Month", "Count", "Limit"]}
            rows={usage.users_near_limit.map((row) => [row.profiles?.full_name || row.user_id, row.month, row.current_month_generation_count, row.monthly_generation_limit])}
          />
          <UsageTable
            title="Recent usage events"
            headers={["Event", "User", "Created"]}
            rows={usage.recent_usage_events.map((row) => [row.event_type, row.profiles?.email || row.user_id || "Unknown", new Date(row.created_at).toLocaleString()])}
          />
        </>
      ) : null}
    </AppShell>
  );
}

function UsageTable({ title, headers, rows }: { title: string; headers: string[]; rows: Array<Array<string | number>> }) {
  return (
    <section>
      <h2>{title}</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((row, index) => (
              <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>
            )) : (
              <tr><td colSpan={headers.length}>No data</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
