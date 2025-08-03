export interface InspectOptions {
  colors?: boolean;
  depth?: number | null;
  compact?: boolean;
  [key: string]: unknown;
}

export function inspect(obj: unknown, options?: InspectOptions): string {
  if ("Deno" in globalThis) {
    return Deno.inspect(obj, {
      colors: options?.colors,
      depth: options?.depth ?? undefined,
      compact: options?.compact ?? true,
    });
  } else {
    const indent = options?.compact === true ? undefined : 2;
    return JSON.stringify(obj, null, indent);
  }
}
