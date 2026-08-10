import "./globals.css";

export const metadata = {
  title: "Zunno × Inco",
  description: "Confidential UNO with encrypted hands on Base.",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}