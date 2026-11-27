/** Deno Lint's strict LogTape rules plus `no-quoted-placeholder`. @module */
import { strictPlugin, withQuotedPlaceholder } from "./plugin-impl.ts";

const quotedPlugin: typeof strictPlugin = withQuotedPlaceholder(strictPlugin);
export default quotedPlugin;
