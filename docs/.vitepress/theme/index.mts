import TwoslashFloatingVue from "@shikijs/vitepress-twoslash/client";
import "virtual:group-icons.css";
import type { EnhanceAppContext } from "vitepress";
// Use the fonts-free theme entry so VitePress does not pull Inter from the
// Google Fonts CDN; LogTape self-hosts its fonts instead (privacy + offline).
import Theme from "vitepress/theme-without-fonts";

// Self-hosted brand fonts (weight axes only; no italics needed).
import "@fontsource-variable/space-grotesk/wght.css";
import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/jetbrains-mono/wght.css";

import "@shikijs/vitepress-twoslash/style.css";
// Imported after the fonts so its --vp-font-family-* overrides win.
import "./custom.css";

import { reveal } from "./reveal";

import LandingHero from "./components/LandingHero.vue";
import LandingUnobtrusive from "./components/LandingUnobtrusive.vue";
import LandingCategories from "./components/LandingCategories.vue";
import LandingFeatures from "./components/LandingFeatures.vue";
import LandingRuntimes from "./components/LandingRuntimes.vue";
import LandingEcosystem from "./components/LandingEcosystem.vue";
import LandingExtend from "./components/LandingExtend.vue";
import LandingRedaction from "./components/LandingRedaction.vue";
import LandingBundleSize from "./components/LandingBundleSize.vue";
import LandingExamples from "./components/LandingExamples.vue";
import LandingCTA from "./components/LandingCTA.vue";

export default {
  extends: Theme,
  enhanceApp({ app }: EnhanceAppContext) {
    app.use(TwoslashFloatingVue);
    app.directive("reveal", reveal);
    app.component("LandingHero", LandingHero);
    app.component("LandingUnobtrusive", LandingUnobtrusive);
    app.component("LandingCategories", LandingCategories);
    app.component("LandingFeatures", LandingFeatures);
    app.component("LandingRuntimes", LandingRuntimes);
    app.component("LandingEcosystem", LandingEcosystem);
    app.component("LandingExtend", LandingExtend);
    app.component("LandingRedaction", LandingRedaction);
    app.component("LandingBundleSize", LandingBundleSize);
    app.component("LandingExamples", LandingExamples);
    app.component("LandingCTA", LandingCTA);
  },
};
