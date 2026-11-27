export type FileMode = {
  readonly mode: number;
  readonly policy: "create" | "enforce";
};

export function parseFileMode(
  mode: unknown,
  policy: unknown,
): FileMode | undefined {
  if (policy !== undefined && policy !== "create" && policy !== "enforce") {
    throw new TypeError('fileModePolicy must be "create" or "enforce".');
  }
  if (mode === undefined && policy === undefined) return undefined;
  if (typeof mode !== "number") {
    throw new TypeError("fileMode must be a number when setting permissions.");
  }
  if (!Number.isInteger(mode) || mode < 0 || mode > 0o777) {
    throw new RangeError("fileMode must be an integer from 0o000 to 0o777.");
  }
  return { mode, policy: policy ?? "create" };
}

export interface RotatingFileOpener<TFile> {
  openSync(path: string): { file: TFile; size?: number };
}
