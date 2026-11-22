import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "./globals.css";
import "./fold.css";
import type { ReactNode } from "react";
export const metadata = { title: "Fold — simple forms", description: "A thoughtful space for questions and answers." };
export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
