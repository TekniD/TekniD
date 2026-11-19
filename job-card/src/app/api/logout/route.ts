import type { NextRequest } from "next/server";
import { json, optionsNotAllowed, rejectCrossOrigin } from "@/lib/server/http";
import { SESSION_COOKIE } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const blocked = rejectCrossOrigin(req);
  if (blocked) return blocked;
  const res = json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "strict", path: "/", maxAge: 0 });
  return res;
}

export const OPTIONS = optionsNotAllowed;
