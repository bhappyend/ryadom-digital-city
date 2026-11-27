import { describe, expect, it, vi } from 'vitest';
import { clamp, createCleanup, createFrameTask, demoFrame, motionMode, scrollProgress } from './motion-state';

describe('motion policy', () => {
  const conditions = { visible: true, reduced: false, saveData: false, desktop: true };
  it('uses static content for reduced motion, saveData, weak hardware and hidden pages', () => {
    for (const override of [{ reduced: true }, { saveData: true }, { cores: 4 }, { memory: 2 }, { visible: false }]) {
      expect(motionMode({ ...conditions, ...override })).toBe('static');
    }
  });
  it('allows reveals on mobile, and only a full scene on capable desktop', () => {
    expect(motionMode({ ...conditions, desktop: false })).toBe('reveal');
    expect(motionMode({ ...conditions, cores: 8, memory: 8 })).toBe('full');
    expect(motionMode(conditions)).toBe('full'); // Unavailable resource hints do not invent device data.
  });
});

describe('decorative progress', () => {
  it('clamps overscroll, invalid input and empty tracks', () => {
    expect(clamp(Number.NaN)).toBe(0);
    expect(scrollProgress(-20, 100, 500)).toBe(0);
    expect(scrollProgress(350, 100, 500)).toBe(.5);
    expect(scrollProgress(900, 100, 500)).toBe(1);
    expect(scrollProgress(0, 100, 0)).toBe(1);
  });
  it('reveals markers, then selection, then a route with reversible bounded frames', () => {
    expect(demoFrame(0)).toEqual({ step: 0, scale: 1, markers: 0, selection: 0, route: 0 });
    expect(demoFrame(.45)).toMatchObject({ step: 1, scale: 1.055, markers: 1, selection: 0, route: 0 });
    expect(demoFrame(.7)).toMatchObject({ step: 2, markers: 1, selection: 1, route: 0 });
    expect(demoFrame(1)).toEqual({ step: 3, scale: 1.055, markers: 1, selection: 1, route: 1 });
    expect(demoFrame(2)).toEqual(demoFrame(1));
    expect(demoFrame(-1)).toEqual(demoFrame(0));
  });
});

describe('effect resource helpers', () => {
  it('releases in reverse order once and releases resources added after unmount immediately', () => {
    const released: number[] = [];
    const cleanup = createCleanup();
    cleanup.add(() => released.push(1));
    cleanup.add(() => { released.push(2); throw new Error('release failure'); });
    cleanup.add(() => released.push(3));
    cleanup.dispose();
    cleanup.dispose();
    cleanup.add(() => released.push(4));
    expect(released).toEqual([3, 2, 1, 4]);
  });
  it('coalesces scroll events and never starts an idle animation loop', () => {
    let callback: FrameRequestCallback | undefined;
    const request = vi.fn((next: FrameRequestCallback) => { callback = next; return 7; });
    const render = vi.fn();
    const task = createFrameTask(request, vi.fn(), render);
    task.schedule(); task.schedule(); task.schedule();
    expect(request).toHaveBeenCalledTimes(1);
    callback?.(0);
    expect(render).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('cancels pending frames and rejects late callback delivery after unmount', () => {
    let callback: FrameRequestCallback | undefined;
    const cancel = vi.fn();
    const render = vi.fn();
    const task = createFrameTask(next => { callback = next; return 9; }, cancel, render);
    task.schedule();
    task.cancel();
    expect(cancel).toHaveBeenCalledWith(9);
    task.schedule();
    task.dispose(); task.dispose(); task.schedule();
    callback?.(0);
    expect(render).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledTimes(2);
  });
});
