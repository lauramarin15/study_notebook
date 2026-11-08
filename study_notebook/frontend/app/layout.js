import "./globals.css";
import Link from "next/link";

export const metadata = {
  title: "StudyNotebook",
  description: "Sube tus PDFs y prepárate para el parcial con resúmenes y preguntas de práctica.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>
        <header className="bar">
          <div className="bar-in">
            <Link href="/" className="brand">
              StudyNotebook
            </Link>
          </div>
        </header>
        <main className="wrap">{children}</main>
      </body>
    </html>
  );
}
