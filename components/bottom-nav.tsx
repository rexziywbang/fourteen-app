import Link from "next/link";

const icons = {
  home: <path d="M3 10.8 12 3l9 7.8V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" />,
  send: <path d="m3 11 18-8-8 18-2-8-8-2Zm8 2 4-4" />,
  you: <><circle cx="12" cy="8" r="4" /><path d="M4 22c.7-4.3 3.3-6.5 8-6.5s7.3 2.2 8 6.5" /></>,
};

export function BottomNav({ active }: { active: "home" | "send" | "you" }) {
  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      {(["home", "send", "you"] as const).map((item) => (
        <Link href={`/${item}`} key={item} className={active === item ? "is-active" : ""} aria-current={active === item ? "page" : undefined}>
          <svg viewBox="0 0 24 24" aria-hidden="true">{icons[item]}</svg>
          <span>{item === "send" ? "Crush" : item[0].toUpperCase() + item.slice(1)}</span>
        </Link>
      ))}
    </nav>
  );
}
