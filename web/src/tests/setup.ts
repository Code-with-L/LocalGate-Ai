import "@testing-library/jest-dom/vitest";

// jsdom has no ResizeObserver; recharts' ResponsiveContainer requires one at
// mount. A no-op stub is enough for these static tests.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (typeof globalThis.ResizeObserver === "undefined") {
  (globalThis as unknown as Record<string, unknown>).ResizeObserver = ResizeObserverStub;
}
