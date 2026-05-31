import styles from "./KeyScheduleDiagram.module.css";

interface KeyScheduleDiagramProps {
  rootLabel?: string;
}

export default function KeyScheduleDiagram({ rootLabel = "export_key" }: KeyScheduleDiagramProps) {
  return (
    <div className={styles.diagram} aria-label="DarkAuth key schedule">
      <div className={styles.root}>
        <span>{rootLabel}</span>
        <small>from OPAQUE, never sent to the server</small>
      </div>
      <div className={styles.derivation}>
        HKDF-SHA256 with user and tenant binding
      </div>
      <div className={styles.node}>
        <span>MK</span>
        <small>master key</small>
      </div>
      <div className={styles.branches}>
        <div className={styles.branch}>
          <span className={styles.branchLabel}>wrap-key</span>
          <strong>KW</strong>
          <p>AEAD-encrypts the Data Root Key</p>
          <code>WRAPPED_DRK</code>
          <small>server stores only this ciphertext</small>
        </div>
        <div className={styles.branch}>
          <span className={styles.branchLabel}>data-derive</span>
          <strong>KDerive</strong>
          <p>Derives app data-encryption keys</p>
          <code>client-side only</code>
          <small>never reconstructable from database state</small>
        </div>
      </div>
    </div>
  );
}
