"use client";

import Link from "next/link";
import { Header } from "@/components/Header";

export default function LogoutPage() {
  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto flex min-h-[calc(100vh-88px)] max-w-3xl flex-col justify-center px-4 py-12 text-center sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Thanks for using AIMME
        </h1>
        <p className="mt-3 text-sm text-slate-400">
          You’ve been signed out. You can return to the welcome page anytime.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/welcome"
            className="rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-500"
          >
            Back to welcome
          </Link>
          <Link
            href="/dashboard"
            className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-800"
          >
            Open dashboard
          </Link>
        </div>
      </main>
    </div>
  );
}

