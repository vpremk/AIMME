import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

function privateKey() {
  return (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
}

export class FirebaseAdminConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FirebaseAdminConfigError";
  }
}

let authInstance: Auth | null = null;
let firestoreInstance: Firestore | null = null;

function getOrInitApp(): App {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const pk = privateKey();
  if (!projectId || !clientEmail || !pk) {
    throw new FirebaseAdminConfigError(
      "Missing Firebase Admin credentials: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.",
    );
  }

  try {
    if (getApps().length > 0) return getApps()[0]!;
    return initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey: pk,
      }),
    });
  } catch (error) {
    throw new FirebaseAdminConfigError(
      error instanceof Error ? error.message : "Failed to initialize Firebase Admin SDK.",
    );
  }
}

export function getAdminAuth(): Auth {
  if (authInstance) return authInstance;
  const app = getOrInitApp();
  authInstance = getAuth(app);
  return authInstance;
}

/** Firestore for minimal free-trial profiles (optional; enable in Firebase console). */
export function getAdminFirestore(): Firestore {
  if (firestoreInstance) return firestoreInstance;
  const app = getOrInitApp();
  firestoreInstance = getFirestore(app);
  return firestoreInstance;
}
