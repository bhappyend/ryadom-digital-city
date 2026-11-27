import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountDigitalCityMotion } from './controller';

// Narrow browser doubles test actual controller lifecycle without a new DOM dependency.
// Layout, paint, accessibility tree and performance still require browser QA.
class TrackedTarget extends EventTarget {
  listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  override addEventListener(type: string, callback: EventListenerOrEventListenerObject | null, options?: AddEventListenerOptions | boolean) {
    if (callback) {
      const set = this.listeners.get(type) ?? new Set();
      set.add(callback); this.listeners.set(type, set);
    }
    super.addEventListener(type, callback, options);
  }
  override removeEventListener(type: string, callback: EventListenerOrEventListenerObject | null, options?: EventListenerOptions | boolean) {
    if (callback) this.listeners.get(type)?.delete(callback);
    super.removeEventListener(type, callback, options);
  }
  get count() { return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0); }
}

function fixture(reducedInitially = false) {
  const reduced = Object.assign(new TrackedTarget(), { matches: reducedInitially });
  const desktop = Object.assign(new TrackedTarget(), { matches: true });
  const connection = Object.assign(new TrackedTarget(), { saveData: false });
  const document = Object.assign(new TrackedTarget(), { visibilityState: 'visible', activeElement: null });
  const properties = new Map<string, string>();
  const attributes = new Map<string, string>();
  const sticky = { getBoundingClientRect: () => ({ height: 420 }) };
  const scene = {
    style: { setProperty: (key: string, value: string) => properties.set(key, value), removeProperty: (key: string) => properties.delete(key) },
    setAttribute: (key: string, value: string) => attributes.set(key, value),
    removeAttribute: (key: string) => attributes.delete(key),
    getAttribute: (key: string) => attributes.get(key),
    querySelector: () => sticky,
    getBoundingClientRect: vi.fn(() => ({ top: 1000, height: 1100 })),
  };
  const floating = { style: { translate: '0 0' } };
  const hero = { querySelector: () => floating, getBoundingClientRect: () => ({ top: 0, height: 800 }) };
  const metric = { textContent: '12\u00a0345', source: 'Проверенный серверный источник' };
  const root = {
    querySelector: () => hero,
    querySelectorAll: vi.fn((selector: string) => selector.includes('data-dc-scene') ? [scene] : []),
  };
  const frames = new Map<number, FrameRequestCallback>();
  let nextId = 0;
  const window = Object.assign(new TrackedTarget(), {
    scrollY: 1200,
    navigator: { hardwareConcurrency: 8, deviceMemory: 8, connection },
    matchMedia: (query: string) => query.includes('reduced') ? reduced : desktop,
    IntersectionObserver: true,
    ResizeObserver: true,
    requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => { frames.set(++nextId, callback); return nextId; }),
    cancelAnimationFrame: vi.fn((id: number) => frames.delete(id)),
  });
  const observers: FakeIntersectionObserver[] = [];
  class FakeIntersectionObserver {
    disconnected = false;
    constructor(readonly callback: (entries: { target: unknown; isIntersecting: boolean }[]) => void) { observers.push(this); }
    observe() {}
    unobserve() {}
    disconnect() { this.disconnected = true; }
  }
  const resizes: { disconnected: boolean }[] = [];
  class FakeResizeObserver {
    disconnected = false;
    constructor() { resizes.push(this); }
    observe() {}
    disconnect() { this.disconnected = true; }
  }
  vi.stubGlobal('window', window);
  vi.stubGlobal('document', document);
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  vi.stubGlobal('getComputedStyle', () => ({ top: '112px' }));
  const mount = () => mountDigitalCityMotion(root as unknown as HTMLElement);
  const enter = () => observers.at(-1)?.callback([{ target: scene, isIntersecting: true }]);
  const flush = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(0)); };
  return { mount, enter, flush, reduced, desktop, connection, window, document, scene, floating, metric, frames, observers, resizes, root, properties, attributes };
}

afterEach(() => vi.unstubAllGlobals());

describe('DigitalCityMotion lifecycle', () => {
  it('does no animation work for reduced motion and preserves server metric text/source', () => {
    const f = fixture(true);
    const original = { ...f.metric };
    const unmount = f.mount();
    expect(f.observers).toHaveLength(0);
    expect(f.frames.size).toBe(0);
    expect(f.root.querySelectorAll).not.toHaveBeenCalled();
    expect(f.metric).toEqual(original);
    unmount();
    expect(f.reduced.count + f.desktop.count + f.connection.count + f.document.count).toBe(0);
  });

  it('stops when reduced motion changes, restores styles, and remounts without leaked listeners', () => {
    const f = fixture();
    const unmount = f.mount();
    f.enter(); f.flush();
    expect(f.properties.has('--dc-demo-scale')).toBe(true);
    f.reduced.matches = true;
    f.reduced.dispatchEvent(new Event('change'));
    expect(f.frames.size).toBe(0);
    expect(f.properties.size).toBe(0);
    expect(f.attributes.size).toBe(0);
    expect(f.observers.every(observer => observer.disconnected)).toBe(true);
    expect(f.window.count).toBe(0);
    unmount();
    f.reduced.matches = false;
    const secondUnmount = f.mount();
    f.enter();
    expect(f.frames.size).toBe(1);
    secondUnmount(); secondUnmount();
    expect(f.frames.size).toBe(0);
    expect(f.window.count + f.document.count + f.reduced.count + f.desktop.count + f.connection.count).toBe(0);
    expect(f.resizes.every(observer => observer.disconnected)).toBe(true);
    expect(f.floating.style.translate).toBe('0 0');
  });

  it('does not read layout on scroll; hidden tabs cancel frames while keeping the scroll track stable', () => {
    const f = fixture();
    const unmount = f.mount();
    f.enter(); f.flush();
    const measurements = f.scene.getBoundingClientRect.mock.calls.length;
    f.window.dispatchEvent(new Event('scroll')); f.window.dispatchEvent(new Event('scroll'));
    expect(f.frames.size).toBe(1);
    f.flush();
    expect(f.scene.getBoundingClientRect).toHaveBeenCalledTimes(measurements);
    f.window.dispatchEvent(new Event('scroll'));
    f.document.visibilityState = 'hidden';
    f.document.dispatchEvent(new Event('visibilitychange'));
    expect(f.frames.size).toBe(0);
    expect(f.attributes.get('data-dc-motion')).toBe('full');
    expect(f.window.listeners.get('scroll')?.size).toBe(0);
    f.window.dispatchEvent(new Event('scroll'));
    expect(f.frames.size).toBe(0);
    f.document.visibilityState = 'visible';
    f.document.dispatchEvent(new Event('visibilitychange'));
    f.flush();
    expect(f.scene.getBoundingClientRect.mock.calls.length).toBeGreaterThan(measurements);
    unmount();
  });

  it('detaches the passive scroll listener outside observed regions and reacts to saveData', () => {
    const f = fixture();
    const unmount = f.mount();
    expect(f.window.listeners.get('scroll')?.size ?? 0).toBe(0);
    f.enter();
    expect(f.window.listeners.get('scroll')?.size).toBe(1);
    f.observers.at(-1)?.callback([{ target: f.scene, isIntersecting: false }]);
    expect(f.window.listeners.get('scroll')?.size).toBe(0);
    expect(f.frames.size).toBe(0);
    f.connection.saveData = true;
    f.connection.dispatchEvent(new Event('change'));
    expect(f.attributes.size).toBe(0);
    unmount();
  });
});
