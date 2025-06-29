export interface InspectOptions {
  colors?: boolean;
  depth?: number | null;
  compact?: boolean;
  [key: string]: unknown;
}

export function inspect(obj: unknown, options?: InspectOptions): string {
  const indent = options?.compact === true ? undefined : 2;
  return JSON.stringify(obj, null, indent);
}
