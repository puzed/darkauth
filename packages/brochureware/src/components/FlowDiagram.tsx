import styles from "./FlowDiagram.module.css";

interface FlowStep {
  from: 0 | 1;
  to: 0 | 1;
  label: string;
  note?: string;
}

interface FlowDiagramProps {
  lanes: [string, string];
  steps: readonly FlowStep[];
}

export default function FlowDiagram({ lanes, steps }: FlowDiagramProps) {
  return (
    <div className={styles.diagram}>
      <div className={styles.lanes}>
        <div>{lanes[0]}</div>
        <div>{lanes[1]}</div>
      </div>
      <div className={styles.steps}>
        {steps.map((step, index) => {
          const direction = step.from === step.to ? "local" : step.from < step.to ? "right" : "left";
          return (
            <div key={`${step.label}-${index}`} className={`${styles.step} ${styles[direction]}`}>
              <div className={styles.leftAnchor} />
              <div className={styles.connector}>
                <span className={styles.line} />
                <span className={styles.arrow} />
              </div>
              <div className={styles.rightAnchor} />
              <div className={styles.content}>
                <span className={styles.label}>{step.label}</span>
                {step.note && <span className={styles.note}>{step.note}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
