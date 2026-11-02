import "./globals.css";

export const metadata = { title: "StudyNotebook" };

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}