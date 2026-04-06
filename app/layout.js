import { DM_Sans } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
});

export const metadata = {
  title: "Lien waiver PDF generator",
  description: "Generate lien waiver PDFs from Excel",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={dmSans.variable}>
      <body
        className={`${dmSans.className} min-h-screen bg-[var(--app-bg)] text-zinc-900 antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
