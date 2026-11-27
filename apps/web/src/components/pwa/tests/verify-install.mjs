// Tests the shared event store with mocked browser events, not a rendered DOM.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../install-state.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function harness({ standalone = false } = {}) {
  const window = new EventTarget();
  const media = Object.assign(new EventTarget(), { matches: standalone });
  window.matchMedia = () => media;
  const active = new Map();
  for (const name of ["addEventListener", "removeEventListener"]) {
    const original = window[name].bind(window);
    window[name] = (type, listener) => {
      active.set(type, (active.get(type) ?? 0) + (name === "addEventListener" ? 1 : -1));
      original(type, listener);
    };
  }
  let subscription;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, window, navigator: {},
    require: (name) => {
      assert.equal(name, "react");
      return { useSyncExternalStore: (subscribe, snapshot, serverSnapshot) => {
        subscription = { subscribe, snapshot, serverSnapshot };
        return snapshot();
      } };
    },
  });
  exports.useInstallState();
  const mount = () => subscription.subscribe(() => {});
  const state = () => subscription.snapshot();
  let prompts = 0;
  function offer(outcome = Promise.resolve({ outcome: "accepted", platform: "web" }), prompt = async () => {}) {
    const event = new Event("beforeinstallprompt", { cancelable: true });
    event.prompt = () => { prompts += 1; return prompt(); };
    event.userChoice = outcome;
    window.dispatchEvent(event);
    return event;
  }
  return { ...exports, window, media, active, mount, state, offer, prompts: () => prompts, server: () => subscription.serverSnapshot() };
}

test("captures once across multiple buttons, waits for explicit request, consumes the event and cleans listeners", async () => {
  const h = harness();
  const unmountFirst = h.mount();
  const unmountSecond = h.mount();
  const event = h.offer();
  assert.equal(event.defaultPrevented, true);
  assert.equal(h.active.get("beforeinstallprompt"), 1);
  assert.equal(h.prompts(), 0);
  assert.equal(h.state().canPrompt, true);
  assert.equal(await h.requestInstall(), "accepted");
  assert.equal(h.prompts(), 1);
  assert.equal(h.state().installed, false, "accepted is not proof of completed installation");
  assert.equal(h.state().busy, false);
  assert.equal(await h.requestInstall(), "unavailable");
  unmountFirst();
  assert.equal(h.active.get("beforeinstallprompt"), 1);
  unmountSecond();
  assert.equal(h.active.get("beforeinstallprompt"), 0);
  assert.equal(h.active.get("appinstalled"), 0);
});

test("concurrent requests cannot prompt twice", async () => {
  const h = harness();
  const unmount = h.mount();
  let resolve;
  h.offer(new Promise((done) => { resolve = done; }));
  const first = h.requestInstall();
  assert.equal(h.state().busy, true);
  assert.equal(await h.requestInstall(), "unavailable");
  resolve({ outcome: "dismissed", platform: "web" });
  assert.equal(await first, "dismissed");
  assert.equal(h.prompts(), 1);
  assert.equal(h.state().installed, false);
  assert.equal(h.state().busy, false);
  unmount();
});

test("prompt exceptions reset pending state and do not invent successful installation", async () => {
  const h = harness();
  const unmount = h.mount();
  h.offer(undefined, async () => { throw new Error("browser denied"); });
  assert.equal(await h.requestInstall(), "failed");
  assert.equal(h.state().installed, false);
  assert.equal(h.state().canPrompt, false);
  assert.equal(h.state().busy, false);
  unmount();
});

test("appinstalled confirms state and discards pending prompt", async () => {
  const h = harness();
  const unmount = h.mount();
  h.offer();
  h.window.dispatchEvent(new Event("appinstalled"));
  assert.equal(h.state().installed, true);
  assert.equal(h.state().canPrompt, false);
  assert.equal(await h.requestInstall(), "unavailable");
  assert.equal(h.prompts(), 0);
  unmount();
});

test("standalone display mode is observed after mount; SSR remains deterministic", () => {
  const h = harness({ standalone: true });
  assert.equal(h.state().installed, false);
  const unmount = h.mount();
  assert.equal(h.state().installed, true);
  assert.equal(h.server().installed, false);
  unmount();
});
