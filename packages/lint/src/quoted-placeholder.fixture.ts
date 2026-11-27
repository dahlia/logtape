/** A shared source fixture for the ESLint, Oxlint, and Deno Lint hosts. */
export const quotedPlaceholderSource = [
  'import { getLogger as get } from "@logtape/logtape";',
  'const logger = get("app");',
  "logger.info`User '${name}'`;", // 3
  "logger.info('User \"{name}\"', { name });", // 4
  "get('app').with({}).getChild('child')['warn']`User \"${name}\"`;", // 5
  "logger.info(`User '{user.name}'` as const, () => ({ user }));", // 6
  "logger.info`User '${name}', ID '${id}'`;", // 7
  "logger.info(`User \\u0022{name}\\u0022`);", // 8
  "logger.info`User \\u0022${{ value: name }.value}\\u0022`;", // 9
  "logger.info('User \"{{name}}\"');",
  "logger.info`User '{name}'`;",
  "logger.info`User '${name} #${id}'`;",
  "logger.info(`User '${name}'`);",
  "logger.info`User '${name}\"`;",
  "logger.info`User ’${name}’`;",
  "logger.info`User '\\unicode${name}'`;",
  "logger[method]`User '${name}'`;",
  "ctx.logger.info`User '${name}'`;",
  "other.info`User '${name}'`;",
  "function f(logger) { logger.info`User '${name}'`; }",
  "logger.info(() => \"'{name}'\");",
  "logger.info(message);",
  "const { info } = logger;",
  "info`User '${name}'`;",
  "logger.info(`User '{name}}'`);",
].join("\n");

export const quotedPlaceholderLines = [3, 4, 5, 6, 7, 8, 9];
