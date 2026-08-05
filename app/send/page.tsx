import { BottomNav } from "@/components/bottom-nav";
import { Brand } from "@/components/brand";
import { SendFlow } from "@/components/send-flow";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Send a crush" };

export default async function SendPage() {
  await requireUser();
  return <main className="app-shell"><header className="app-header"><Brand compact /><span className="header-title">Send a crush</span><span className="header-spacer" /></header><SendFlow /><BottomNav active="send" /></main>;
}
