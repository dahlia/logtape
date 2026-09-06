import * as elysia from "elysia";
import * as utils from "elysia/utils";
import type { ElysiaContext } from "./mod.ts";

type Callback = (this: unknown, ...args: unknown[]) => unknown;
type Fields = Record<string, unknown>;

export interface HookContext extends ElysiaContext {
  store: { startTime: number };
  error?: unknown;
  code?: string;
}

/** The adapter only needs these lifecycle registration capabilities. */
export function createCompatibility(instance: unknown) {
  const plugin = instance as Fields;
  const v2 = typeof plugin.onRequest !== "function" &&
    typeof plugin.request === "function";
  const register = (
    event: "Request" | "BeforeHandle" | "AfterHandle" | "Error",
    callback: (context: HookContext) => unknown,
  ): void => {
    const name = v2 ? event[0].toLowerCase() + event.slice(1) : `on${event}`;
    const method = plugin[name];
    if (typeof method !== "function") throw unsupported();
    method.call(instance, (raw: HookContext) =>
      callback(
        v2 ? normalizeContext(raw, event === "Error") : raw,
      ));
  };
  const as = (scope: "scoped" | "global"): void => {
    (plugin.as as Callback).call(
      instance,
      v2 && scope === "scoped" ? "plugin" : scope,
    );
  };
  return { v2, register, as };
}

function unsupported(): Error {
  return new Error(
    "@logtape/elysia: unsupported Elysia 2 internals for local request " +
      "context. Use a supported Elysia version and the same Elysia copy " +
      "and module format for the application and plugin (including utils).",
  );
}

/** Elysia 2 shares a frozen default header map until its first write. */
export function materializeHeaders(set: ElysiaContext["set"]): void {
  if ((set.headers as Record<string, unknown>)["\0"] === set.headers) {
    set.headers = Object.assign(Object.create(null), set.headers);
  }
}

function numericStatus(value: unknown, fallback: number): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    return (elysia.StatusMap as Record<string, number>)[value] ?? fallback;
  }
  return fallback;
}

function normalizeContext(raw: HookContext, error: boolean): HookContext {
  const rawSet = raw.set;
  materializeHeaders(rawSet);
  const response = (raw as unknown as Fields).responseValue;
  const statusClass = (elysia as unknown as Fields).ElysiaStatus;
  const responseStatus = !error &&
      (response instanceof Response ||
        (typeof statusClass === "function" && response instanceof statusClass))
    ? (response as { status: number }).status
    : undefined;
  const set = Object.create(rawSet, {
    status: {
      enumerable: true,
      get: () =>
        responseStatus ?? numericStatus(rawSet.status, error ? 500 : 200),
      set: (value: number) => {
        rawSet.status = value;
      },
    },
    headers: {
      enumerable: true,
      get: () => {
        materializeHeaders(rawSet);
        return rawSet.headers;
      },
      set: (value: ElysiaContext["set"]["headers"]) => {
        rawSet.headers = value;
      },
    },
  });
  return Object.assign(Object.create(raw), { set });
}

export function nativeErrorCode(error: unknown): string | number | undefined {
  if (error == null || typeof error !== "object") return undefined;
  const code = (error as Fields).code;
  return typeof code === "string" || typeof code === "number"
    ? code
    : undefined;
}

const hookKeys = [
  "beforeHandle",
  "afterHandle",
  "parse",
  "transform",
  "derive",
  "mapDerive",
  "mapResponse",
  "afterResponse",
  "error",
];
const routeMethods = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "options",
  "head",
  "all",
  "method",
  "use",
  "group",
  "guard",
  "mount",
];

/**
 * Elysia 2 has no around-handler lifecycle. Its declared route tuples and
 * immutable hook-chain links are private integration points, verified by the
 * pinned compatibility matrix. Only this logger's copied rows are rewritten;
 * an imported child must remain safe to reuse in another application.
 */
export function wrapV2LocalContext(
  instance: unknown,
  wrapCallback: (value: unknown) => unknown,
  macroName: string,
): () => void {
  const plugin = instance as Fields;
  const origins = (utils as unknown as Fields).fnOrigin;
  if (!(origins instanceof WeakMap)) throw unsupported();
  const probe = () => {};
  const probeApp = new elysia.Elysia({
    name: "@logtape/elysia/probe",
  }) as unknown as Fields;
  if (typeof probeApp.beforeHandle !== "function") throw unsupported();
  probeApp.beforeHandle(probe);
  // A different ESM/CJS copy or a bundled utils module has a different map.
  if (!origins.has(probe)) throw unsupported();

  const replacements = new WeakMap<object, object>();
  const wrap = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      const present = new Set(value);
      // Early-wrapped guard errors can meet their original macro callback.
      // Native macro dedupe would retain the existing (wrapped) slot. Remove
      // only that mixed representation, not deliberate [fn, fn] repetitions.
      return value.filter((item) => {
        if (typeof item !== "function") return true;
        const replacement = replacements.get(item);
        return replacement == null || !present.has(replacement);
      }).map(wrap);
    }
    const wrapped = wrapCallback(value);
    if (
      typeof value === "function" && typeof wrapped === "function" &&
      value !== wrapped
    ) {
      replacements.set(value, wrapped);
    }
    if (
      typeof value === "function" && typeof wrapped === "function" &&
      origins.has(value)
    ) origins.set(wrapped, origins.get(value));
    return wrapped;
  };
  const resolveParse = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(resolveParse);
    const parsers = (plugin["~ext"] as Fields | undefined)?.parser as
      | Fields
      | undefined;
    return wrap(typeof value === "string" ? parsers?.[value] ?? value : value);
  };
  const hooks = (value: unknown, final = false): unknown => {
    if (value == null) return final ? value : { [macroName]: true };
    if (typeof value !== "object" || Array.isArray(value)) throw unsupported();
    const source = value as Fields;
    const copy = { ...source };
    for (const key of hookKeys) {
      if (final && key in source) {
        copy[key] = key === "parse"
          ? resolveParse(source[key])
          : wrap(source[key]);
      }
    }
    if (final && "~deriveEntries" in source) {
      if (!Array.isArray(source["~deriveEntries"])) throw unsupported();
      copy["~deriveEntries"] = source["~deriveEntries"].map((entry) =>
        Array.isArray(entry) ? [wrap(entry[0]), ...entry.slice(1)] : wrap(entry)
      );
    }
    // Run after the route's own macro options have expanded. Reinsert last
    // under reentrant use/group calls to retain native expansion order.
    delete copy[macroName];
    if (!final) copy[macroName] = true;
    return copy;
  };
  if (typeof plugin.macro !== "function") throw unsupported();
  plugin.macro({
    [macroName]: {
      introspect(resolved: Fields): void {
        // Native macro expansion is deferred until composition. Only copied
        // local hooks carry this private option; children and unrelated parent
        // routes stay untouched. Elysia removes the option after introspection.
        Object.assign(resolved, hooks(resolved, true));
      },
    },
  });
  // Own links are compiler stop points: preserve even earlier snapshots.
  const protectedNodes = new WeakSet<object>();
  const protect = (value: unknown): void => {
    if (value == null) return;
    if (typeof value !== "object") throw unsupported();
    if (protectedNodes.has(value)) return;
    protectedNodes.add(value);
    const node = value as Fields;
    protect(node.parent);
    protect(node.over);
    // combine contains imported child links; these must still be wrapped.
  };
  const chain = (
    value: unknown,
    memo = new WeakMap<object, Fields>(),
    final = false,
  ): unknown => {
    if (value == null) return value;
    if (typeof value !== "object") throw unsupported();
    if (protectedNodes.has(value)) return value;
    const node = value as Fields;
    const existing = memo.get(value);
    if (existing != null) return existing;
    const copy = { ...node };
    memo.set(value, copy);
    if ("combine" in node) {
      copy.combine = chain(node.combine, memo, final);
      // Nested imported chains can have child hooks on either branch.
      // protectedNodes preserves actual logger stop points by identity.
      copy.over = chain(node.over, memo, final);
    } else {
      if (!("added" in node)) throw unsupported();
      // Preserve propagated callback identities for native deduplication,
      // but still visit local ancestors below the propagated link.
      copy.added = node.propagated === true
        ? node.added
        : hooks(node.added, final);
      copy.parent = chain(node.parent, memo, final);
    }
    if ((node.owner as Fields | undefined)?.["~scopeChild"] === true) {
      copy.owner = owner(node.owner);
    }
    return copy;
  };
  const owners = new WeakMap<object, object>();
  const projections = new WeakSet<object>();
  const owner = (source: unknown): unknown => {
    if (source === instance) return source;
    if (!(source instanceof elysia.Elysia)) throw unsupported();
    if (projections.has(source)) return source;
    const cached = owners.get(source);
    if (cached != null) return cached;
    // Error compilation reads the owner's live chain, not only route[5].
    // Both views share callback identities so native includes() dedupes them.
    const nativeApplyMacro = plugin["~applyMacro"];
    if (typeof nativeApplyMacro !== "function") throw unsupported();
    const scopeViews = new WeakMap<object, object>();
    const scopeView = (target: object): object => {
      const cached = scopeViews.get(target);
      if (cached != null) return cached;
      const view = new Proxy(target, {
        get(target, key) {
          const value = Reflect.get(target, key, target);
          if (key === "~hookChain") return chain(value, new WeakMap(), true);
          if ((source as unknown as Fields)["~scopeChild"] !== true) {
            return value;
          }
          if (key === "~generation" && value != null) return scopeView(value);
          if (key === "~ext" && value?.macro != null) {
            // A group resolves its scope's macros before the root's macros.
            // Hide only our terminal macro in that first phase, retaining the
            // option until the final root expansion. User macros stay native.
            return {
              ...value,
              macro: new Proxy(value.macro, {
                has: (table, name) =>
                  name !== macroName && Reflect.has(table, name),
              }),
            };
          }
          if (key === "~applyMacro") {
            return (...args: unknown[]) => nativeApplyMacro.apply(view, args);
          }
          return value;
        },
      });
      scopeViews.set(target, view);
      return view;
    };
    const projection = scopeView(source);
    owners.set(source, projection);
    projections.add(projection);
    return projection;
  };
  const rows = (): unknown[][] => {
    const value = plugin.declaredRoutes;
    if (value === undefined) return [];
    if (!Array.isArray(value)) throw unsupported();
    return value;
  };
  for (const name of routeMethods) {
    const original = plugin[name];
    if (typeof original !== "function") throw unsupported();
    plugin[name] = function (this: unknown, ...args: unknown[]): unknown {
      protect(plugin["~hookChain"]);
      const start = rows().length;
      const result = original.apply(this, args);
      const routes = rows();
      for (let i = start; i < routes.length; i++) {
        const source = routes[i];
        if (!Array.isArray(source) || source.length < 4) throw unsupported();
        if (
          source[0] === "WS" ||
          (source[2] != null && (source[2] as Fields)["~mount"])
        ) continue;
        const copy = source.slice();
        copy[2] = wrap(source[2]);
        copy[3] = owner(source[3]);
        copy[4] = hooks(source[4]);
        copy[5] = chain(source[5]);
        copy[6] = chain(source[6]);
        if ((source[7] as Fields | undefined)?.["~scopeChild"] === true) {
          copy[7] = owner(source[7]);
        }
        routes[i] = copy;
      }
      return result;
    };
  }
  // Install only after internal logging hooks, which must not be rewrapped.
  return () => {
    protect(plugin["~hookChain"]);
    for (const name of [...hookKeys, "guard"]) {
      const original = plugin[name];
      if (typeof original !== "function") throw unsupported();
      plugin[name] = function (this: unknown, ...args: unknown[]): unknown {
        const mapped = args.slice();
        if (name === "guard") {
          // Callback-form guard creates a child; the route wrapper handles it.
          if (typeof args.at(-1) !== "function") {
            const index = typeof args[0] === "string" ? 1 : 0;
            const hook = hooks(args[index]) as Fields;
            // Native error collection also reads the owner's raw guard chain.
            // Keep that callback identical to the expanded error callback.
            if (hook.error != null) hook.error = wrap(hook.error);
            mapped[index] = hook;
          }
        } else if (name === "parse") {
          const index = args.length > 1 && typeof args[0] === "string" ? 1 : 0;
          mapped[index] = resolveParse(args[index]);
        } else if (name === "error") {
          // Error dictionaries contain constructors, not lifecycle callbacks.
          if (args.length === 1 && typeof args[0] === "object") {
            return original.apply(this, args);
          }
          const index = args.length - 1;
          mapped[index] = wrap(args[index]);
        } else {
          const index = typeof args[0] === "string" ? 1 : 0;
          mapped[index] = wrap(args[index]);
        }
        const result = original.apply(this, mapped);
        protect(plugin["~hookChain"]);
        return result;
      };
    }
  };
}
