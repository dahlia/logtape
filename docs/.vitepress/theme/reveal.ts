import type { Directive } from "vue";

/**
 * `v-reveal`: a tiny scroll-reveal directive.
 *
 * SSR renders the element fully visible (the directive hooks never run on the
 * server), so the content is always present without JavaScript.  On the client
 * it adds the `lt-reveal` hidden state and reveals the element once it scrolls
 * into view.  `prefers-reduced-motion` is honoured via CSS.
 */
interface RevealEl extends HTMLElement {
  _revealObserver?: IntersectionObserver;
}

export const reveal: Directive<RevealEl> = {
  mounted(el) {
    if (
      typeof IntersectionObserver === "undefined" ||
      typeof window === "undefined"
    ) {
      el.classList.add("is-visible");
      return;
    }
    el.classList.add("lt-reveal");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(el);
    el._revealObserver = observer;
  },
  unmounted(el) {
    el._revealObserver?.disconnect();
  },
};
