// Anthropic OAuth callback stub — not yet implemented.
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { error: "Not implemented", message: "Anthropic OAuth callback not yet implemented. Use API key path instead." },
    { status: 501 }
  );
}
