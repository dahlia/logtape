/** Deno Lint's default LogTape rules plus `no-quoted-placeholder`. @module */
import { logtapePlugin, withQuotedPlaceholder } from "./plugin-impl.ts";

const quotedPlugin: typeof logtapePlugin = withQuotedPlaceholder(logtapePlugin);
export default quotedPlugin;
