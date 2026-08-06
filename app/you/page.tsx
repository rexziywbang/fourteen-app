import Link from "next/link";
import { signOut, unblockUserAction } from "@/app/actions";
import { DeleteAccountForm } from "@/components/account-actions";
import { BottomNav } from "@/components/bottom-nav";
import { Brand } from "@/components/brand";
import { ReportForm } from "@/components/report-form";
import { ShareInvite } from "@/components/share-invite";
import { getBlockedUsers, getCircle } from "@/lib/backend";
import { requireUser } from "@/lib/session";

export const metadata = { title: "You" };

export default async function YouPage() {
  const user = await requireUser();
  const [circle, blocked] = await Promise.all([getCircle(user.id), getBlockedUsers(user.id)]);
  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/?invite=${user.memberNumber}`;
  return (
    <main className="app-shell"><header className="app-header"><Brand compact /><span className="header-title">You</span><span className="header-spacer" /></header><section className="settings-page">
      <div className="profile-card"><span className="avatar avatar--large">{user.firstName?.[0]}{user.lastName?.[0]}</span><div><h1>{user.firstName} {user.lastName}</h1><p>Class of {user.classYear} · Member #{user.memberNumber}</p></div></div>
      <section className="settings-section"><p className="eyebrow">Private account details</p><div className="data-row"><span>School email</span><strong>{user.email}</strong></div><p className="settings-help">Your school email is used for sign-in and is never visible to other students.</p></section>
      <section className="settings-section"><div className="settings-heading"><div><p className="eyebrow">Your circle</p><h2>{circle.length} people</h2></div><button disabled>Manage soon</button></div><div className="circle-stack">{circle.map((person) => <div key={String(person.id)}><span className="avatar">{String(person.first_name)[0]}{String(person.last_name)[0]}</span><strong>{String(person.first_name)} {String(person.last_name)}</strong><small>’{String(person.class_year).slice(-2)}</small></div>)}</div></section>
      <section className="settings-section" id="blocked"><p className="eyebrow">Safety</p><h2>Blocked people</h2><p className="settings-help">They simply stop appearing. No one is told.</p>{blocked.length ? <div className="blocked-list">{blocked.map((person) => <div key={String(person.id)}><span>{String(person.first_name)} {String(person.last_name)}</span><form action={unblockUserAction}><input type="hidden" name="targetId" value={String(person.id)} /><button>Unblock</button></form></div>)}</div> : <p className="settings-empty">No one is blocked.</p>}</section>
      <section className="settings-section"><p className="eyebrow">Invite</p><h2>More people, better guesses.</h2><p className="lede">Share this private link with someone you actually know.</p><input readOnly value={inviteUrl} aria-label="Invite link" /><ShareInvite url={inviteUrl} /></section>
      <section className="settings-section settings-list"><Link className="settings-row" href="/safety">Safety guide <span>→</span></Link><ReportForm /><Link className="settings-row" href="/privacy">Privacy <span>→</span></Link><Link className="settings-row" href="/terms">Terms <span>→</span></Link><form action={signOut}><button className="settings-row">Sign out <span>→</span></button></form><DeleteAccountForm /></section>
    </section><BottomNav active="you" /></main>
  );
}
