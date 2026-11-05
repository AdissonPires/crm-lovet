import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Lovet CRM",
  description: "CRM da Lovet Distribuidora — do lead à venda concluída",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // O script abaixo troca data-theme antes da hidratação — o atributo difere do HTML do servidor de propósito.
      suppressHydrationWarning
    >
      <head>
        {/* Aplica o tema salvo antes de pintar, pra não piscar claro. Padrão: claro. */}
        <script dangerouslySetInnerHTML={{ __html: `try{if(localStorage.getItem("tema")==="dark")document.documentElement.dataset.theme="dark"}catch(e){}` }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
