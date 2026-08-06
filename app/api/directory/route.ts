import { NextRequest, NextResponse } from "next/server";
import { consumeRateLimit, searchDirectory } from "@/lib/backend";
import { currentUser } from "@/lib/session";
import { directoryQuerySchema } from "@/lib/validation";

export async function GET(request: NextRequest) {
  const user = await currentUser();
  if (!user?.onboardingComplete) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rate = await consumeRateLimit(user.id, "search_directory", 30, 60);
  if (!rate.allowed) return NextResponse.json([], { status: 429, headers: { "Retry-After": String(rate.retryAfter) } });
  const parsed = directoryQuerySchema.safeParse(request.nextUrl.searchParams.get("q"));
  if (!parsed.success) return NextResponse.json([]);
  return NextResponse.json(await searchDirectory(user.id, parsed.data), { headers: { "Cache-Control": "no-store" } });
}
