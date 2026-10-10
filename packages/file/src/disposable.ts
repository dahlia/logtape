// Keep native disposal symbols when available; use registry fallbacks for
// transpiled explicit resource management without changing global Symbol.
export const disposeSymbol: typeof Symbol.dispose = Symbol.dispose ??
  Symbol.for("Symbol.dispose");
export const asyncDisposeSymbol: typeof Symbol.asyncDispose =
  Symbol.asyncDispose ?? Symbol.for("Symbol.asyncDispose");
