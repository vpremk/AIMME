import type { NextApiRequest, NextApiResponse } from "next";
import { requireRequestAuth, type AuthSource, type ResolvedRequestAuth } from "@/lib/request-auth";

export type VerifiedAuth = {
  uid: string;
  role: ResolvedRequestAuth["role"];
  source: AuthSource;
  orgId?: string | null;
  orgName?: string | null;
  email?: string | null;
};

/** Verify Auth0 enterprise session from nextjs-auth0. */
export async function verifyToken(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<VerifiedAuth> {
  const auth = await requireRequestAuth(req, res);
  return {
    uid: auth.uid,
    role: auth.role,
    source: auth.source,
    orgId: auth.orgId,
    orgName: auth.orgName,
    email: auth.email,
  };
}
