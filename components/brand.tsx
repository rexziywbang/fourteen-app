import Link from "next/link";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className={`brand ${compact ? "brand--compact" : ""}`} href="/" aria-label="Fourteen home">
      <span className="brand__heart" aria-hidden="true">♥</span>
      <span>fourteen</span>
    </Link>
  );
}
