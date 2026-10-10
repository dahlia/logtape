// Keep the native symbols when available, and use the same registry symbols as
// transpiled explicit resource management in runtimes without them.  Do not
// polyfill the global Symbol constructor.
export const disposeSymbol: typeof Symbol.dispose = Symbol.dispose ??
  Symbol.for("Symbol.dispose");
export const asyncDisposeSymbol: typeof Symbol.asyncDispose =
  Symbol.asyncDispose ?? Symbol.for("Symbol.asyncDispose");
