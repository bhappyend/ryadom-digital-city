export type MotionMode = 'static' | 'reveal' | 'full';

export interface MotionConditions {
  reduced: boolean;
  saveData: boolean;
  cores?: number;
  memory?: number;
  desktop: boolean;
  visible: boolean;
}

export function motionMode(input: MotionConditions): MotionMode {
  if (!input.visible || input.reduced || input.saveData ||
    (input.cores !== undefined && input.cores <= 4) ||
    (input.memory !== undefined && input.memory <= 4)) return 'static';
  return input.desktop ? 'full' : 'reveal';
}

export const DEMO_STEPS = [
  { key: 'zoom', label: 'Приближение', from: 0, to: .25 },
  { key: 'markers', label: 'Маркеры мест', from: .25, to: .5 },
  { key: 'selection', label: 'Выбор места', from: .5, to: .75 },
  { key: 'route', label: 'Пример маршрута', from: .75, to: 1 },
] as const;

export function clamp(value: number, min = 0, max = 1): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
}

function phase(progress: number, from: number, to: number): number {
  return clamp((progress - from) / (to - from));
}

export function demoFrame(progress: number) {
  const p = clamp(progress);
  return {
    step: Math.min(3, Math.floor(p * DEMO_STEPS.length)),
    scale: 1 + phase(p, 0, .25) * .055,
    markers: phase(p, .25, .42),
    selection: phase(p, .5, .65),
    route: phase(p, .75, 1),
  };
}

/** Geometry is measured on resize/layout changes, never on each scroll event. */
export function scrollProgress(scrollY: number, start: number, travel: number): number {
  return travel > 0 ? clamp((scrollY - start) / travel) : 1;
}

export function createCleanup() {
  let closed = false;
  const callbacks: (() => void)[] = [];
  return {
    add(callback: () => void) {
      if (closed) callback();
      else callbacks.push(callback);
    },
    dispose() {
      if (closed) return;
      closed = true;
      // Continue releasing observers/listeners even if one browser API throws.
      for (const callback of callbacks.reverse()) {
        try { callback(); } catch { /* Enhancement failure must not affect navigation. */ }
      }
      callbacks.length = 0;
    },
  };
}

/** Coalesce events into one frame. There is deliberately no self-scheduling loop. */
export function createFrameTask(
  request: (callback: FrameRequestCallback) => number,
  cancel: (id: number) => void,
  render: () => void,
) {
  let frame: number | null = null;
  let disposed = false;
  return {
    schedule() {
      if (disposed || frame !== null) return;
      frame = request(() => {
        frame = null;
        if (!disposed) render();
      });
    },
    cancel() {
      if (frame !== null) cancel(frame);
      frame = null;
    },
    dispose() {
      disposed = true;
      if (frame !== null) cancel(frame);
      frame = null;
    },
  };
}
