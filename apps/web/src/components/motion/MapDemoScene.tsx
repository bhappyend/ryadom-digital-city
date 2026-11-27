import { DEMO_STEPS } from './motion-state';
import { MapDemoArtwork } from './MapDemoArtwork';
import styles from './motion.module.css';

/** Server-renderable illustration. No map SDK, coordinates, controls or provider claims. */
export function MapDemoScene() {
  return <div className={styles.scene} data-dc-scene="">
    <figure className={styles.figure} data-dc-sticky="">
      <div className={styles.viewport} aria-hidden="true">
        <div className={styles.canvas}>
          <MapDemoArtwork className={styles.map ?? ''} />
          <svg className={styles.overlay} viewBox="0 0 720 410" focusable="false">
            <path className={styles.route} d="M155 292 230 265 231 196 340 164 340 115 528 115 570 55" pathLength="1" />
            <circle className={styles.routeOrigin} cx="155" cy="292" r="9" />
            <circle className={styles.selection} cx="570" cy="55" r="25" />
          </svg>
          <img className={`${styles.marker} ${styles.markerOne}`} src="/assets/markers/cafe.svg" alt="" width={40} height={40} loading="lazy" />
          <img className={`${styles.marker} ${styles.markerTwo}`} src="/assets/markers/cafe.svg" alt="" width={40} height={40} loading="lazy" />
          <img className={`${styles.marker} ${styles.markerEnd}`} src="/assets/markers/cafe.svg" alt="" width={40} height={40} loading="lazy" />
          <span className={styles.example}>Пример выбора места</span>
        </div>
      </div>
      <figcaption className={styles.caption}>Демонстрация интерфейса · не навигационная карта</figcaption>
      <ol className={styles.steps} aria-label="Этапы демонстрации">
        {DEMO_STEPS.map((step, index) => <li key={step.key} data-dc-demo-label={index}>{step.label}</li>)}
      </ol>
    </figure>
  </div>;
}
