import { NextResponse } from "next/server";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Wrap a route handler body: returns JSON, and turns HttpError into a clean response. */
export async function handle(fn: () => Promise<Response | object>): Promise<Response> {
  try {
    const r = await fn();
    return r instanceof Response ? r : NextResponse.json(r);
  } catch (e: any) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("API error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
