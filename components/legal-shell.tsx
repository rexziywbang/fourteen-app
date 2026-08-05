import Link from "next/link";
import { Brand } from "@/components/brand";

export function LegalShell({ eyebrow, title, updated, children }: { eyebrow: string; title: string; updated: string; children: React.ReactNode }) {
  return <main className="legal-page"><header><Brand compact /><Link href="/">Back home</Link></header><article><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="legal-updated">Last updated {updated} · Plain-language launch draft</p>{children}</article><footer><Brand compact /><nav><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link><Link href="/safety">Safety</Link></nav></footer></main>;
}
