import { adminLogout, resolveReportAction } from "@/app/actions";
import { getFounderDashboard } from "@/lib/backend";
import { requireAdmin } from "@/lib/session";

export const metadata = { title: "Founder operations" };

function percent(part: number, whole: number) {
  return whole ? `${Math.round((part / whole) * 100)}%` : "0%";
}

export default async function AdminPage() {
  await requireAdmin();
  const { totals, retention, funnel, reports } = await getFounderDashboard();
  const steps = [
    ["Signed up", Number(funnel.signed_up)],
    ["Onboarded", Number(funnel.onboarded)],
    ["Sent a crush", Number(funnel.sent_a_crush)],
    ["Opened a crush", Number(funnel.opened_a_crush)],
    ["Made a guess", Number(funnel.made_a_guess)],
  ] as const;

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div><span className="admin-mark">14</span><div><p>FOURTEEN / INTERNAL</p><strong>Founder operations</strong></div></div>
        <nav><form action={adminLogout}><button>Lock console</button></form></nav>
      </header>
      <section className="admin-main">
        <div className="admin-warning"><strong>Aggregate-only operations.</strong><span>Individual accounts and crush relationships are intentionally unavailable here.</span></div>
        <div className="metric-grid">
          <article><span>Signups</span><strong>{totals.users}</strong><small>non-demo accounts</small></article>
          <article><span>Onboarded</span><strong>{totals.onboarded}</strong><small>{percent(Number(totals.onboarded), Number(totals.users))} activation</small></article>
          <article><span>Crushes</span><strong>{totals.crushes}</strong><small>{totals.active_crushes} active</small></article>
          <article className="metric-alert"><span>Open reports</span><strong>{totals.open_reports}</strong><small>private safety queue</small></article>
        </div>

        <section className="admin-section">
          <div className="admin-section-title"><div><p className="eyebrow">Product health</p><h1>Activation funnel</h1></div></div>
          <div className="funnel-grid">
            {steps.map(([label, value], index) => (
              <article key={label}><span>{label}</span><strong>{value}</strong><small>{index ? percent(value, steps[index - 1][1]) : "baseline"}</small></article>
            ))}
          </div>
        </section>

        <section className="admin-section">
          <div className="admin-section-title"><div><p className="eyebrow">Retention</p><h2>Return signals</h2></div></div>
          <div className="metric-grid metric-grid--compact">
            <article><span>Active in 7 days</span><strong>{retention.active_7d}</strong><small>{percent(Number(retention.active_7d), Number(totals.users))} of signups</small></article>
            <article><span>Active in 30 days</span><strong>{retention.active_30d}</strong><small>{percent(Number(retention.active_30d), Number(totals.users))} of signups</small></article>
            <article><span>Round finishers</span><strong>{retention.round_finishers}</strong><small>unique members</small></article>
            <article><span>Resolved crushes</span><strong>{totals.resolved_crushes}</strong><small>mutual or revealed</small></article>
          </div>
        </section>

        <section className="admin-section" id="reports">
          <div className="admin-section-title"><div><p className="eyebrow">Safety</p><h2>Private reports</h2></div><span>{reports.filter((report) => !report.resolved_at).length} open</span></div>
          <div className="table-wrap"><table><thead><tr><th>Status</th><th>Private report</th><th>Received</th><th>Action</th></tr></thead><tbody>
            {reports.length ? reports.map((report) => <tr key={String(report.id)}><td><span className={`status status--${report.resolved_at ? "resolved" : "queued"}`}>{report.resolved_at ? "resolved" : "open"}</span></td><td><div className="report-cell">{String(report.reason)}</div></td><td>{new Date(String(report.created_at)).toLocaleString()}</td><td>{!report.resolved_at && <form action={resolveReportAction}><input type="hidden" name="reportId" value={String(report.id)} /><button>Resolve</button></form>}</td></tr>) : <tr><td colSpan={4} className="empty-table">No safety reports.</td></tr>}
          </tbody></table></div>
        </section>
        <section className="admin-notes"><h2>Privacy boundary</h2><p>This console exposes aggregate product signals and the minimum report text needed for safety review. Account identities and crush joins are unavailable by design.</p></section>
      </section>
    </main>
  );
}
