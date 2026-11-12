import "./globals.css";
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/source-serif-4";
import Link from "next/link";
import Icon from "./components/Icon";

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
              <span className="brand-mark"><Icon name="book" /></span>
              Study<span className="brand-light">Notebook</span>
            </Link>
            <nav aria-label="Navegación principal" className="header-nav">
              <Link href="/"><Icon name="library" /> Mis cuadernos</Link>
            </nav>
            <span className="header-note"><span /> Un espacio para aprender</span>
          </div>
        </header>
        <main className="wrap">{children}</main>
        <footer className="footer">
          <span>StudyNotebook</span>
          <span>Una idea a la vez.</span>
        </footer>
      </body>
    </html>
  );
}
