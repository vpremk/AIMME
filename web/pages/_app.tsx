import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { AuthProvider } from "@/context/AuthProvider";
import { BrandProvider } from "@/context/BrandProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * Pages Router root — fonts, global CSS, toast host for ingest feedback.
 */
export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <div
      className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-[var(--background)] text-[var(--foreground)] antialiased`}
    >
      <AuthProvider>
        <BrandProvider>
          <Component {...pageProps} />
        </BrandProvider>
      </AuthProvider>
      <Toaster
        theme="dark"
        position="top-right"
        richColors
        toastOptions={{
          classNames: {
            toast:
              "bg-[var(--surface)] border border-[var(--surface-border)] text-[var(--foreground)] shadow-xl",
          },
        }}
      />
    </div>
  );
}
