import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aplicație Comparare Contabilitate",
  description: "Aplicație pentru compararea facturilor Excel cu datele ANAF",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ro">
      <body>
        {children}
      </body>
    </html>
  );
}