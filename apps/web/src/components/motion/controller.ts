import { createCleanup, createFrameTask, demoFrame, motionMode, scrollProgress } from './motion-state';

type ResourceNavigator = Navigator & {
  deviceMemory?: number;
  connection?: EventTarget & { saveData?: boolean };
};

/** Only touches explicitly scoped decorative targets. Never reads/writes metric text. */
export function mountDigitalCityMotion(root: HTMLElement): () => void {
  const lifetime = createCleanup();
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const desktop = window.matchMedia('(min-width: 64rem) and (min-height: 40rem) and (pointer: fine)');
  const navigator = window.navigator as ResourceNavigator;
  const seen = new WeakSet<Element>();
  let stopEffects = () => {};
  let handleVisibility = () => applyPolicy();

  function applyPolicy() {
    stopEffects();
    const effects = createCleanup();
    stopEffects = effects.dispose;
    handleVisibility = () => applyPolicy();
    const mode = motionMode({
      reduced: reduced.matches,
      saveData: navigator.connection?.saveData === true,
      ...(navigator.hardwareConcurrency ? { cores: navigator.hardwareConcurrency } : {}),
      ...(navigator.deviceMemory ? { memory: navigator.deviceMemory } : {}),
      desktop: desktop.matches,
      visible: document.visibilityState === 'visible',
    });
    if (mode === 'static' || !('IntersectionObserver' in window)) return;

    // Reveal is an animation from an already-visible state, with no fill or hidden class.
    const animations = new Set<Animation>();
    effects.add(() => { for (const animation of animations) animation.cancel(); });
    handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        for (const animation of animations) animation.cancel();
      }
    };
    function reveal(element: HTMLElement, delay = 0) {
      if (seen.has(element) || typeof element.animate !== 'function') return;
      seen.add(element);
      const animation = element.animate([
        { opacity: .88, translate: '0 6px' },
        { opacity: 1, translate: '0 0' },
      ], { duration: 420, delay, easing: 'cubic-bezier(.22,1,.36,1)' });
      animations.add(animation);
      animation.finished.then(() => animations.delete(animation), () => animations.delete(animation));
    }
    const targets = Array.from(root.querySelectorAll<HTMLElement>(
      '.hero-copy, #categories .category-link, #reviews .review, #reviews .review-empty',
    ));
    const revealObserver = new IntersectionObserver(entries => {
      if (document.visibilityState !== 'visible') return;
      let order = 0;
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const element = entry.target as HTMLElement;
        // Never replay a reveal underneath a user's active keyboard focus.
        if (!element.contains(document.activeElement)) reveal(element, Math.min(order++, 5) * 28);
        else seen.add(element);
        revealObserver.unobserve(element);
      }
    }, { threshold: .08 });
    effects.add(() => revealObserver.disconnect());
    for (const target of targets) if (!seen.has(target)) revealObserver.observe(target);
    if (mode !== 'full') return;

    const scenes = Array.from(root.querySelectorAll<HTMLElement>(
      '[data-motion="map-demo"] [data-dc-scene]',
    ));
    const hero = root.querySelector<HTMLElement>('.hero');
    const floating = hero?.querySelector<HTMLElement>('.hero-floating');
    const active = new Set<Element>();
    const geometry = new Map<HTMLElement, { start: number; travel: number }>();
    let heroStart = 0;
    let heroTravel = 1;
    let measureNeeded = true;
    const originalFloat = floating?.style.translate ?? '';

    // Reserve the scroll track at hydration, before its first in-view progress update.
    for (const scene of scenes) {
      scene.setAttribute('data-dc-motion', 'full');
      effects.add(() => {
        scene.removeAttribute('data-dc-motion');
        scene.removeAttribute('data-dc-step');
        for (const property of ['--dc-demo-scale', '--dc-demo-markers', '--dc-demo-selection', '--dc-demo-route']) scene.style.removeProperty(property);
      });
    }
    effects.add(() => { if (floating) floating.style.translate = originalFloat; });

    function measure() {
      // All layout reads precede frame writes. ResizeObserver invalidates this cache.
      for (const scene of scenes) {
        const rect = scene.getBoundingClientRect();
        const sticky = scene.querySelector<HTMLElement>('[data-dc-sticky]');
        if (!sticky) continue;
        const inset = Number.parseFloat(getComputedStyle(sticky).top) || 0;
        geometry.set(scene, { start: rect.top + window.scrollY - inset, travel: rect.height - sticky.getBoundingClientRect().height });
      }
      if (hero) {
        const rect = hero.getBoundingClientRect();
        heroStart = rect.top + window.scrollY;
        heroTravel = Math.max(1, rect.height);
      }
      measureNeeded = false;
    }

    const task = createFrameTask(window.requestAnimationFrame.bind(window), window.cancelAnimationFrame.bind(window), () => {
      if (!active.size || document.visibilityState !== 'visible') return;
      if (measureNeeded) measure();
      const scroll = window.scrollY;
      for (const scene of scenes) {
        if (!active.has(scene)) continue;
        const box = geometry.get(scene);
        if (!box) continue;
        const frame = demoFrame(scrollProgress(scroll, box.start, box.travel));
        scene.style.setProperty('--dc-demo-scale', frame.scale.toFixed(4));
        scene.style.setProperty('--dc-demo-markers', frame.markers.toFixed(3));
        scene.style.setProperty('--dc-demo-selection', frame.selection.toFixed(3));
        scene.style.setProperty('--dc-demo-route', frame.route.toFixed(3));
        const step = String(frame.step);
        if (scene.getAttribute('data-dc-step') !== step) scene.setAttribute('data-dc-step', step);
      }
      if (hero && floating && active.has(hero)) {
        floating.style.translate = `0 ${(-4 * scrollProgress(scroll, heroStart, heroTravel)).toFixed(2)}px`;
      }
    });
    effects.add(task.dispose);
    const onScroll = () => { if (active.size && document.visibilityState === 'visible') task.schedule(); };
    const onResize = () => { measureNeeded = true; if (active.size && document.visibilityState === 'visible') task.schedule(); };
    let listening = false;
    function syncScrollListener() {
      const canListen = active.size > 0 && document.visibilityState === 'visible';
      if (canListen && !listening) {
        window.addEventListener('scroll', onScroll, { passive: true });
        listening = true;
      } else if (!canListen && listening) {
        window.removeEventListener('scroll', onScroll);
        listening = false;
        task.cancel();
      }
    }
    effects.add(() => window.removeEventListener('scroll', onScroll));
    handleVisibility = () => {
      syncScrollListener();
      if (document.visibilityState === 'hidden') {
        task.cancel();
        for (const animation of animations) animation.cancel();
      } else {
        measureNeeded = true;
        if (active.size) task.schedule();
      }
    };
    window.addEventListener('resize', onResize, { passive: true });
    effects.add(() => window.removeEventListener('resize', onResize));
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) active.add(entry.target);
        else active.delete(entry.target);
      }
      syncScrollListener();
      if (active.size && document.visibilityState === 'visible') { measureNeeded = true; task.schedule(); }
    });
    effects.add(() => observer.disconnect());
    for (const scene of scenes) observer.observe(scene);
    if (hero && floating) observer.observe(hero);
    if ('ResizeObserver' in window) {
      const resizeObserver = new ResizeObserver(onResize);
      resizeObserver.observe(root);
      for (const scene of scenes) {
        resizeObserver.observe(scene);
        const sticky = scene.querySelector<HTMLElement>('[data-dc-sticky]');
        if (sticky) resizeObserver.observe(sticky);
      }
      effects.add(() => resizeObserver.disconnect());
    }
  }

  // React Strict Mode mounts and route unmounts release the same complete resource set.
  lifetime.add(() => stopEffects());
  const onPolicyChange = () => {
    try { applyPolicy(); } catch { stopEffects(); }
  };
  for (const query of [reduced, desktop]) {
    query.addEventListener('change', onPolicyChange);
    lifetime.add(() => query.removeEventListener('change', onPolicyChange));
  }
  const onVisibility = () => {
    try { handleVisibility(); } catch { stopEffects(); }
  };
  document.addEventListener('visibilitychange', onVisibility);
  lifetime.add(() => document.removeEventListener('visibilitychange', onVisibility));
  navigator.connection?.addEventListener('change', onPolicyChange);
  lifetime.add(() => navigator.connection?.removeEventListener('change', onPolicyChange));
  try { applyPolicy(); } catch { lifetime.dispose(); }
  return lifetime.dispose;
}
