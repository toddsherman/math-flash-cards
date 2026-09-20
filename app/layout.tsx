import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Little Numbers · Math Practice",
  description: "Full-screen number flashcards with spoken pronunciation.",
  appleWebApp: { capable: true, title: "Numbers", statusBarStyle: "default" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#e9eddf" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
