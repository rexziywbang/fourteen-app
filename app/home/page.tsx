import Link from "next/link";
import { BottomNav } from "@/components/bottom-nav";
import { Brand } from "@/components/brand";
import { getCompliments, getCrushMessage, getHomeData, getNotifications } from "@/lib/db";
import { requireUser } from "@/lib/session";

function daysLeft(expires: unknown) {
  return Math.max(0, Math.ceil((new Date(String(expires)).getTime() - Date.now()) / 86_400_000));
}

function notificationCopy(kind: unknown, payload: Record<string, unknown>) {
  if (kind === "crush_received") return "Someone has a crush on you. Hint 1 of 14 is waiting.";
  if (kind === "mutual_reveal") return "It’s mutual. Open the app.";
  if (kind === "identity_revealed") return "Your crush chose to reveal themselves.";
  if (kind === "consent_prompt") return "They guessed you. Reveal yourself?";
  if (kind === "fuse_progress") return `They unlocked hint ${String(payload.hint_number)} today.`;
  if (kind === "guess_made") return payload.is_correct ? "They took a guess today." : "They took a guess today. It wasn’t you. Safe for another day.";
  if (kind === "quiet_close") return "Your crush window closed quietly. Your next one will be ready Monday.";
  return "Something real happened on Fourteen.";
}

export default async function HomePage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const user = await requireUser();
  const data = getHomeData(user.id);
  const compliments = getCompliments(user.id);
  const notifications = getNotifications(user.id);
  const { welcome } = await searchParams;
  return (
    <main className="app-shell">
      <header className="app-header"><Brand compact /><span className="day-stamp">WED · AUG 5</span><Link className="avatar avatar--small" href="/you">{user.firstName?.[0]}{user.lastName?.[0]}</Link></header>
      <section className="feed">
        {welcome && <div className="welcome-banner"><span>✦</span><div><strong>You’re in.</strong><p>Your circle is private. Let’s make the first move count.</p></div></div>}
        <div className="feed-heading"><p className="eyebrow">Tonight on Fourteen</p><h1>Hey, {user.firstName}.</h1></div>

        <section className="feed-zone">
          <div className="zone-title"><h2>For you</h2><span>{data.received.length}</span></div>
          {data.received.length ? data.received.map((item) => <Link className="crush-card crush-card--received" href={item.status === "mutual" || item.status === "revealed" ? `/reveal/${item.id}` : `/crush/${item.id}`} key={String(item.id)}><div className="card-kicker"><span className="pulse-dot" /> {item.status === "mutual" ? "It’s mutual" : item.status === "revealed" ? "They said yes" : "Someone has a crush on you"}</div><blockquote>“{getCrushMessage(Number(item.message_id))}”</blockquote><div className="fuse"><span style={{ width: `${(Number(item.hints_unlocked) / 14) * 100}%` }} /></div><div className="card-meta"><span>Day {15 - daysLeft(item.expires_at)} of 14 · {String(item.hints_unlocked)} hint unlocked</span><strong>{item.status === "mutual" || item.status === "revealed" ? "Reveal →" : `${daysLeft(item.expires_at)}d left →`}</strong></div></Link>) : <div className="empty-card"><span className="empty-moon">☾</span><h3>Nothing yet.</h3><p>Someone’s probably working up the nerve.</p></div>}
        </section>

        <section className="feed-zone">
          <div className="zone-title"><h2>Your move</h2></div>
          {data.sent.length ? data.sent.map((item) => <Link className="sent-card" href={item.status === "mutual" || item.status === "revealed" ? `/reveal/${item.id}` : `/sent/${item.id}`} key={String(item.id)}><div><span className="eyebrow">{item.status === "mutual" ? "It’s mutual" : item.status === "revealed" ? "Revealed" : "Fuse burning"}</span><h3>{String(item.recipient_first_name)} {String(item.recipient_last_name)}</h3><p>{String(item.hints_unlocked)} of 14 hints unlocked</p></div><div className="countdown"><strong>{item.status === "mutual" || item.status === "revealed" ? "✦" : daysLeft(item.expires_at)}</strong><span>{item.status === "mutual" || item.status === "revealed" ? "open" : "days"}</span></div></Link>) : <Link href="/send" className="send-cta"><span className="cta-heart">♥</span><div><p className="eyebrow">One brave thing</p><h3>Send this week’s crush</h3><p>You get one. Make it honest.</p></div><span>→</span></Link>}
        </section>

        <section className="feed-zone"><div className="zone-title"><h2>Today’s round</h2><span className="teal-pill">30 sec</span></div>{data.circleCount >= 4 ? <div className="poll-card"><div><span>6</span><small>cards</small></div><h3>Six warm questions. Four familiar names.</h3><Link className="button button--teal" href="/round">Play today’s round</Link></div> : <div className="invite-card"><span>◌</span><div><h3>Bring a few more people in.</h3><p>Polls unlock when 4 of your people are here. You have {data.circleCount}.</p></div><Link href="/you">Invite →</Link></div>}</section>

        <section className="feed-zone"><div className="zone-title"><h2>Kind things said</h2><span>{compliments.length}</span></div>{compliments.length ? <div className="compliment-list">{compliments.map((item) => <article key={String(item.id)}><span>✦</span><div><small>Someone said</small><p>“{String(item.prompt_text)}”</p></div></article>)}</div> : <div className="empty-compliments"><span>✦</span><p>Compliments land here—without the picker’s name.</p></div>}</section>
        {notifications.length > 0 && <section className="feed-zone feed-zone--last"><div className="zone-title"><h2>Activity</h2><span>{notifications.length}</span></div><div className="activity-list">{notifications.map((item) => <article key={item.id}><span>♥</span><div><p>{notificationCopy(item.kind, item.payload)}</p><small>{new Date(item.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</small></div></article>)}</div></section>}
      </section>
      <BottomNav active="home" />
    </main>
  );
}
