import util from "node:util";

export interface InspectOptions {
  colors?: boolean;
  depth?: number | null;
  compact?: boolean;
  [key: string]: unknown;
}

export function inspect(obj: unknown, options?: InspectOptions): string {
  return util.inspect(obj, options);
}
