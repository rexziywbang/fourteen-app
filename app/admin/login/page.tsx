import { redirect } from "next/navigation";
import { AdminLoginForm } from "@/components/admin-login-form";
import { Brand } from "@/components/brand";
import { isAdmin } from "@/lib/session";

export const metadata = { title: "Founder access" };

export default async function AdminLoginPage() {
  if (await isAdmin()) redirect("/admin");
  return <main className="centered-page"><div className="auth-card auth-card--admin"><Brand /><p className="eyebrow">Restricted</p><h1>Founder operations.</h1><p className="lede">This area contains private launch data. Every operational change is logged.</p><AdminLoginForm /><p className="microcopy">Local default: founder-demo. Set ADMIN_ACCESS_KEY before sharing or deploying.</p></div></main>;
}
