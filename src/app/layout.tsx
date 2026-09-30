import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dadito 🎲 — Pensado, Desarrollado y Ejecutado por Empresas El BroThanosAPI",
  description:
    "Crea una sala, invita a tus amigos y juega en tiempo real al clásico juego del dado: lanza, arriesga y asegura tus puntos. Dinero 100% virtual con reglas de premio definidas por el administrador.",
  keywords: ["dadito", "dado", "juego de mesa", "online", "amigos", "tiempo real", "El BroThanosAPI"],
  applicationName: "Dadito",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icon-192.png", type: "image/png" }],
    apple: [{ url: "/icon-192.png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Dadito",
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Aplica el tema guardado ANTES del primer pintado (evita parpadeo oscuro).
// Por defecto: modo claro (fondo blanco).
const THEME_BOOT = `(function(){try{var t=localStorage.getItem("dado-loco:theme");if(t!=="dark"){document.documentElement.classList.add("light")}}catch(e){document.documentElement.classList.add("light")}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
