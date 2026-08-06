import Link from "next/link";
import { Brand } from "@/components/brand";
import { VerifyForm } from "@/components/verify-form";

export const metadata = { title: "Check your email" };

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email = "" } = await searchParams;
  return (
    <main className="centered-page">
      <div className="auth-card">
        <Brand />
        <div className="auth-icon">✦</div>
        <p className="eyebrow">Check your inbox</p>
        <h1>Six little digits.</h1>
        <p className="lede">We sent a sign-in code to <strong>{email || "your @umich.edu inbox"}</strong>. It expires in 10 minutes.</p>
        <VerifyForm email={email} />
        <Link className="text-link" href="/">Use a different email</Link>
      </div>
    </main>
  );
}
