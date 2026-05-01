import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { Sidebar } from "@/components/layout/sidebar";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Bud — Financial Command Center",
  description: "AI-first personal financial planning",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          <Sidebar />
          <main className="flex-1 overflow-auto">{children}</main>
          <Toaster position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
