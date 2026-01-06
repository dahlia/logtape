import customRules from "@hongminhee/markdownlint-rules";
import preset from "@hongminhee/markdownlint-rules/preset";

export default {
  globs: ["**/*.md"],
  customRules,
  config: {
    ...preset,
    "heading-sentence-case": {
      allowed_words: [
        "Benchmarks",
        "CloudWatch",
        "Event",
        "Lines",
        "Log",
        "Logs",
        "OpenTelemetry",
        "Pino",
        "Sentry",
        "Signale",
        "Sink",
      ],
    },
    "MD013": {
      "code_blocks": false,
      "tables": false,
    },
  },
  ignores: ["**/node_modules/**", "**/dist/**", "**/site-packages/**"],
};
