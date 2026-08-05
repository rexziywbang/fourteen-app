import { NextResponse } from "next/server";
import { auditAdmin, getFounderDashboard } from "@/lib/db";
import { isAdmin } from "@/lib/session";

function csv(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { jobs } = getFounderDashboard();
  const headers = ["job_id", "status", "created_at", "recipient_member_number", "recipient_name", "recipient_phone", "recipient_email", "message", "deep_link", "sender_member_number", "sender_name", "sender_email"];
  const lines = [headers.map(csv).join(","), ...jobs.map((job) => [job.id, job.status, job.created_at, job.recipient_number, `${job.recipient_first_name} ${job.recipient_last_name}`, job.recipient_phone, job.recipient_email, job.message, job.deep_link, job.sender_number, job.sender_first_name, job.sender_email].map(csv).join(","))];
  auditAdmin("contact_queue_exported", "contact_jobs", null, { row_count: jobs.length });
  return new NextResponse(lines.join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="fourteen-contact-queue-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" } });
}
