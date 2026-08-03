globalThis.window = globalThis;
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: {
    userAgent: 'node',
    platform: 'node',
    language: 'pt-BR',
    maxTouchPoints: 0,
    appVersion: 'node',
  },
});
const ctxStub = new Proxy(
  {},
  {
    get(t, p) {
      if (p === 'canvas') return { width: 1, height: 1 };
      if (p === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      return () => {};
    },
    set() {
      return true;
    },
  }
);
globalThis.document = {
  readyState: 'complete',
  createElement: () => ({
    style: {},
    getContext: () => ctxStub,
    setAttribute: () => {},
    getAttribute: () => null,
    addEventListener: () => {},
    removeEventListener: () => {},
    appendChild: () => {},
    getBoundingClientRect: () => ({ width: 1280, height: 720, left: 0, top: 0, right: 1280, bottom: 720 }),
    width: 1,
    height: 1,
  }),
  createElementNS: () => ({ style: {}, getContext: () => ctxStub }),
  documentElement: { style: {} },
  body: {
    appendChild: () => {},
    style: {},
    getBoundingClientRect: () => ({ width: 1280, height: 720, left: 0, top: 0, right: 1280, bottom: 720 }),
  },
  head: { appendChild: () => {}, style: {} },
  addEventListener: (type, cb) => {
    if (type === 'DOMContentLoaded') setTimeout(cb, 0);
  },
  removeEventListener: () => {},
};
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 10);
globalThis.cancelAnimationFrame = () => {};
globalThis.devicePixelRatio = 1;
globalThis.HTMLCanvasElement = function HTMLCanvasElement() {};
globalThis.Image = class {
  set src(v) {
    this._src = v;
    setTimeout(() => {
      if (typeof this.onload === 'function') this.onload();
      if (this._handlers && this._handlers.load) this._handlers.load();
    }, 0);
  }
  get src() {
    return this._src;
  }
  addEventListener(type, cb) {
    this._handlers = this._handlers || {};
    this._handlers[type] = cb;
  }
  removeEventListener() {}
};
globalThis.screen = { orientation: null, width: 1280, height: 720 };
globalThis.URL = globalThis.URL;
globalThis.location = { protocol: 'file:' };
