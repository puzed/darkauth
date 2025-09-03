import styles from "./user-cell.module.css";

export default function UserCell({
  name,
  email,
  sub,
}: {
  name?: string;
  email: string;
  sub: string;
}) {
  return (
    <div className={styles.cell}>
      <div className={styles.avatar}>
        <img
          className={styles.avatarImg}
          src={`/avatars/${sub}.png`}
          alt={name || email}
          onError={(e) => {
            const img = e.currentTarget;
            img.style.display = "none";
            const next = img.nextElementSibling as HTMLElement | null;
            if (next) next.style.display = "flex";
          }}
        />
        <div className={styles.avatarFallback} style={{ display: "none" }}>
          {(name || email).charAt(0).toUpperCase()}
        </div>
      </div>
      <div className={styles.info}>
        <div className={styles.name}>{name || "Unnamed User"}</div>
        <div className={styles.sub}>{sub}</div>
      </div>
    </div>
  );
}
