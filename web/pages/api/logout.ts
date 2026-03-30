import type { NextApiRequest, NextApiResponse } from "next";

const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";

function clearCookie(name: string): string {
  return `${name}=; Path=/; HttpOnly${secure}; SameSite=Lax; Max-Age=0`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  res.setHeader("Set-Cookie", [
    clearCookie("aimme_session"),
    clearCookie("aimme_tier"),
    clearCookie("aimme_sandbox_role"),
  ]);
  return res.status(200).json({ ok: true });
}
