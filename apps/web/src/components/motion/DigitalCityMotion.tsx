'use client';

import { useEffect } from 'react';
import { mountDigitalCityMotion } from './controller';
import { createCleanup } from './motion-state';

/** Render once inside the home main. All server content remains visible without JS. */
export function DigitalCityMotion() {
  useEffect(() => {
    const cleanup = createCleanup();
    const root = document.getElementById('main');
    if (!root) return;
    let disposed = false;
    cleanup.add(() => { disposed = true; });
    const start = () => {
      if (disposed) return;
      const requestIdle = window.requestIdleCallback;
      if (typeof requestIdle === 'function') {
        const idle = requestIdle.call(window, () => {
          if (!disposed) cleanup.add(mountDigitalCityMotion(root));
        }, { timeout: 1000 });
        cleanup.add(() => window.cancelIdleCallback(idle));
      } else {
        const timer = window.setTimeout(() => {
          if (!disposed) cleanup.add(mountDigitalCityMotion(root));
        }, 160);
        cleanup.add(() => window.clearTimeout(timer));
      }
    };
    if (document.readyState === 'complete') start();
    else {
      window.addEventListener('load', start, { once: true });
      cleanup.add(() => window.removeEventListener('load', start));
    }
    return cleanup.dispose;
  }, []);
  return null;
}
