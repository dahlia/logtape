import { resolve } from "node:path";
import ts from "typescript";

/** Normalize compiler file names across platform separators and casing. */
export function canonicalPath(path: string): string {
  const normalized = resolve(path).replaceAll("\\", "/");
  return ts.sys.useCaseSensitiveFileNames
    ? normalized
    : normalized.toLowerCase();
}

/** Resolve source queries and package-local aliases for a check-only program. */
export function createCheckHost(options: ts.CompilerOptions): ts.CompilerHost {
  const host = ts.createCompilerHost(options);
  host.resolveModuleNameLiterals = (literals, file, redirect, opts, source) =>
    literals.map((literal) => {
      const target = literal.text.startsWith(".")
        ? literal.text.split(/[?#]/, 1)[0]
        : literal.text;
      // A peer declaration's private import belongs to that peer's package.
      // The current package's source alias must not override it.
      const resolverOptions =
        literal.text.startsWith("#") &&
        opts.baseUrl != null &&
        !canonicalPath(file).startsWith(`${canonicalPath(opts.baseUrl)}/`)
          ? { ...opts, paths: undefined }
          : opts;
      return ts.resolveModuleName(
        target,
        file,
        resolverOptions,
        host,
        undefined,
        redirect,
        ts.getModeForUsageLocation(source, literal, opts),
      );
    });
  return host;
}
