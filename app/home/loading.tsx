import { Brand } from "@/components/brand";

export default function HomeLoading() {
  return (
    <main className="app-shell" aria-busy="true" aria-label="Loading your Fourteen home">
      <header className="app-header"><Brand compact /><span className="day-stamp">FOURTEEN</span><span className="avatar avatar--small" /></header>
      <section className="feed home-skeleton">
        <div className="skeleton-line skeleton-line--short" />
        <div className="skeleton-line skeleton-line--title" />
        <div className="skeleton-card"><div className="skeleton-line skeleton-line--short" /><div className="skeleton-line skeleton-line--quote" /><div className="skeleton-line" /></div>
        <div className="skeleton-card skeleton-card--small"><div className="skeleton-line skeleton-line--short" /><div className="skeleton-line skeleton-line--quote" /></div>
        <div className="skeleton-card skeleton-card--small"><div className="skeleton-line" /><div className="skeleton-line skeleton-line--short" /></div>
      </section>
    </main>
  );
}
