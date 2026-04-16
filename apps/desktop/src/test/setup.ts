import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

const emptyRectList = {
  length: 0,
  item: () => null,
  [Symbol.iterator]: function* iterator() {},
};

const emptyRect = {
  x: 0,
  y: 0,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  width: 0,
  height: 0,
  toJSON: () => "",
};

function installRectShim(target: object | undefined) {
  if (!target) {
    return;
  }

  if (!("getClientRects" in target)) {
    Object.defineProperty(target, "getClientRects", {
      configurable: true,
      value: () => emptyRectList,
    });
  }

  if (!("getBoundingClientRect" in target)) {
    Object.defineProperty(target, "getBoundingClientRect", {
      configurable: true,
      value: () => emptyRect,
    });
  }
}

if (typeof document.elementFromPoint !== "function") {
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: () => document.body,
  });
}

installRectShim(globalThis.HTMLElement?.prototype);
installRectShim(globalThis.Element?.prototype);
installRectShim(globalThis.Range?.prototype);
installRectShim(globalThis.Text?.prototype);

if (globalThis.HTMLMediaElement) {
  Object.defineProperty(globalThis.HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: vi.fn().mockResolvedValue(undefined),
  });

  Object.defineProperty(globalThis.HTMLMediaElement.prototype, "pause", {
    configurable: true,
    value: vi.fn(),
  });

  Object.defineProperty(globalThis.HTMLMediaElement.prototype, "load", {
    configurable: true,
    value: vi.fn(),
  });
}

if (typeof globalThis.URL.createObjectURL !== "function") {
  let blobUrlCounter = 0;

  Object.defineProperty(globalThis.URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => {
      blobUrlCounter += 1;
      return `blob:audaisy-${blobUrlCounter}`;
    }),
  });
}

if (typeof globalThis.URL.revokeObjectURL !== "function") {
  Object.defineProperty(globalThis.URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
}
