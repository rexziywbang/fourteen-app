import Link from "next/link";
import { Brand } from "@/components/brand";

export default function UnderagePage() {
  return <main className="centered-page"><div className="auth-card"><Brand /><div className="auth-icon">○</div><h1>This app is 18+.</h1><p className="lede">Your account was deleted, including the birth date you entered. We hope to see you another time.</p><Link className="text-link" href="/safety">Read our safety approach</Link></div></main>;
}
