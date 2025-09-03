import { Search } from "lucide-react";
import type { ReactNode } from "react";
import styles from "./list-card.module.css";

type SearchProps = {
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
};

export default function ListCard({
  title,
  description,
  search,
  rightActions,
  children,
}: {
  title: string;
  description?: string;
  search?: SearchProps;
  rightActions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardHeaderContent}>
          <div className={styles.titleWrap}>
            <h3 className={styles.cardTitle}>{title}</h3>
            {description ? <p className={styles.cardDescription}>{description}</p> : null}
          </div>
          <div className={styles.rightActions}>
            {search ? (
              <div className={styles.searchContainer}>
                <Search className={styles.searchIcon} />
                <input
                  className={styles.searchInput}
                  placeholder={search.placeholder ?? "Search..."}
                  value={search.value}
                  onChange={(e) => search.onChange(e.target.value)}
                />
              </div>
            ) : null}
            {rightActions}
          </div>
        </div>
      </div>
      <div className={styles.cardContent}>{children}</div>
    </div>
  );
}
