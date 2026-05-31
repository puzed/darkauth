import styles from "./PageHero.module.css";

interface PageHeroProps {
  eyebrow?: string;
  title: string;
  sub?: string;
}

export default function PageHero({ eyebrow, title, sub }: PageHeroProps) {
  return (
    <section className={styles.hero}>
      <div className="container">
        {eyebrow && <span className={styles.eyebrow}>{eyebrow}</span>}
        <h1 className={styles.title}>{title}</h1>
        {sub && <p className={styles.sub}>{sub}</p>}
      </div>
    </section>
  );
}
