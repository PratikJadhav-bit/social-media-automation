import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Autopilot · Your content, on course",
  description: "Free-first social media operations for independent creators",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
