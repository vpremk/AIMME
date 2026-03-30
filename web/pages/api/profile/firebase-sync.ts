import type { NextApiRequest, NextApiResponse } from "next";
import { FieldValue } from "firebase-admin/firestore";
import { FirebaseAdminConfigError, getAdminAuth, getAdminFirestore } from "@/lib/firebase-admin";

/** Minimal free-trial profile in Firestore (best-effort; requires Firestore API enabled). */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const idToken = String(req.body?.idToken || "");
  if (!idToken) return res.status(400).json({ error: "idToken required" });

  let adminAuth;
  try {
    adminAuth = getAdminAuth();
  } catch (error) {
    if (error instanceof FirebaseAdminConfigError) {
      return res.status(503).json({ error: error.message });
    }
    throw error;
  }

  try {
    const decoded = await adminAuth.verifyIdToken(idToken, true);
    try {
      const db = getAdminFirestore();
      await db.collection("aimme_profiles").doc(decoded.uid).set(
        {
          uid: decoded.uid,
          email: decoded.email ?? null,
          authTier: "free_trial_sandbox",
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    } catch {
      /* Firestore disabled or rules — still ok */
    }
    return res.status(200).json({ ok: true });
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}
