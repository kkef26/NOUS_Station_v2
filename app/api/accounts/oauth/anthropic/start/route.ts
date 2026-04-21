// Anthropic OAuth start — redirects to API key form for now.
// Full OAuth flow blocked pending Anthropic console verification (see friction backlog).
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const accountId = searchParams.get("account_id") || "";
  // Fall back to API key entry — OAuth not yet verified for console.anthropic.com
  const url = `/settings/accounts?mode=apikey&account_id=${encodeURIComponent(accountId)}&provider=anthropic`;
  return NextResponse.redirect(new URL(url, req.url));
}
