import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { WelcomeFlow } from "@/components/welcome-flow";
import { suggestedPeople } from "@/lib/db";
import { currentUser } from "@/lib/session";

export const metadata = { title: "Welcome" };

export default async function WelcomePage() {
  const user = await currentUser();
  if (!user) redirect("/");
  if (user.onboardingComplete) redirect("/home");
  return <main className="onboarding-page"><header><Brand compact /></header><WelcomeFlow people={suggestedPeople(user.id)} /></main>;
}
