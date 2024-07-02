const filesink: Omit<typeof import("./filesink.deno.ts"), "denoDriver"> =
  await ("Deno" in globalThis
    ? import("./filesink.deno.ts")
    : import("./filesink.node.ts"));

export const getFileSink = filesink.getFileSink;
export const getRotatingFileSink = filesink.getRotatingFileSink;

// cSpell: ignore filesink
