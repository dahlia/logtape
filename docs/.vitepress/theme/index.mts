import TwoslashFloatingVue from "@shikijs/vitepress-twoslash/client";
import "virtual:group-icons.css";
import type { EnhanceAppContext } from "vitepress";
import Theme from "vitepress/theme";

import "@shikijs/vitepress-twoslash/style.css";
import "./custom.css";

export default {
  extends: Theme,
  enhanceApp({ app }: EnhanceAppContext) {
    app.use(TwoslashFloatingVue);
  },
};
