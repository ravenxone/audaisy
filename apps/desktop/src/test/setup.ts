import "@testing-library/jest-dom/vitest";

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
