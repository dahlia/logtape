// Detect if we're in a browser environment without using window directly
function isBrowser(): boolean {
  try {
    return (
      // @ts-ignore: Browser detection
      typeof document !== "undefined" ||
      // @ts-ignore: React Native detection
      typeof navigator !== "undefined" && navigator.product === "ReactNative"
    );
  } catch {
    return false;
  }
}

interface InspectOptions {
  colors?: boolean;
  depth?: number | null;
  compact?: boolean;
  [key: string]: unknown;
}

interface UtilInterface {
  inspect(obj: unknown, options?: InspectOptions): string;
}

// Default implementation with fallback
let utilModule: UtilInterface = {
  inspect(obj: unknown, options?: InspectOptions): string {
    const indent = options?.compact === true ? undefined : 2;
    return JSON.stringify(obj, null, indent);
  },
};

// Only try to import node:util in non-browser environments
if (!isBrowser()) {
  if ("Deno" in globalThis) {
    // @ts-ignore: Deno.inspect() exists
    utilModule = { inspect: Deno.inspect };
  } else {
    import("node:util").then((util) => {
      utilModule.inspect = util.inspect;
    });
  }
}

export default utilModule;
