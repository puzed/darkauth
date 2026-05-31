import type { ReactNode } from "react";
import Layout from "./Layout";
import PageHero from "./PageHero";
import Accordion from "./Accordion";
import RelatedLinks from "./RelatedLinks";
import styles from "./FeatureDeepDive.module.css";

interface RelatedLink {
  label: string;
  to?: string;
  href?: string;
}

interface FeatureDeepDiveProps {
  eyebrow?: string;
  title: string;
  sub?: string;
  definition: string;
  whyItMatters: ReactNode;
  howItWorksEli5: ReactNode;
  howItWorksPrecise: ReactNode;
  details: string[];
  caveats?: ReactNode;
  related: RelatedLink[];
}

export default function FeatureDeepDive({
  eyebrow = "Feature",
  title,
  sub,
  definition,
  whyItMatters,
  howItWorksEli5,
  howItWorksPrecise,
  details,
  caveats,
  related,
}: FeatureDeepDiveProps) {
  return (
    <Layout>
      <PageHero eyebrow={eyebrow} title={title} sub={sub} />
      <div className="container">
        <div className={styles.page}>
          <p className={styles.definition}>{definition}</p>

          <section className={styles.section}>
            <h2>Why it matters</h2>
            <div>{whyItMatters}</div>
          </section>

          <section className={styles.section}>
            <h2>How it works</h2>
            <Accordion label="Simple explanation" badge="ELI5" defaultOpen>
              {howItWorksEli5}
            </Accordion>
            <Accordion label="Technical details" badge="Precise">
              {howItWorksPrecise}
            </Accordion>
          </section>

          <section className={styles.section}>
            <h2>Key details</h2>
            <ul className={styles.detailList}>
              {details.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          </section>

          {caveats && (
            <section className={styles.section}>
              <h2>Honest caveats</h2>
              <div className={styles.caveat}>{caveats}</div>
            </section>
          )}

          <RelatedLinks links={related} />
        </div>
      </div>
    </Layout>
  );
}
