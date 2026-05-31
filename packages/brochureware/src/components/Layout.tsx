import type { ReactNode } from "react";
import Header from "./Header";
import Footer from "./Footer";
import styles from "./Layout.module.css";

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className={styles.layout}>
      <a href="#main-content" className={styles.skipLink}>
        Skip to main content
      </a>
      <Header />
      <main id="main-content" className={styles.main}>
        {children}
      </main>
      <Footer />
    </div>
  );
}
