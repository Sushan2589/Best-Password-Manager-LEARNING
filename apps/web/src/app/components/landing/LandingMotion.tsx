"use client";

import { useEffect } from "react";
import styles from "../../landing.module.css";

/** Progressive enhancement: content stays visible without JS or observer support. */
export default function LandingMotion() {
  useEffect(() => {
    const root = document.querySelector("[data-landing-page]");
    if (!root || !("IntersectionObserver" in window)) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const elements = root.querySelectorAll<HTMLElement>("[data-reveal]");
    let observer: IntersectionObserver | undefined;

    function configure() {
      observer?.disconnect();
      elements.forEach(element => element.classList.remove(styles.revealEntering));
      if (preference.matches) return;
      observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          // Never fade a control that the user has already reached by keyboard.
          if (!entry.target.contains(document.activeElement)) {
            entry.target.classList.add(styles.revealEntering);
          }
          observer?.unobserve(entry.target);
        });
      }, { threshold: 0.08 });
      elements.forEach(element => observer?.observe(element));
    }

    configure();
    preference.addEventListener("change", configure);
    return () => {
      observer?.disconnect();
      preference.removeEventListener("change", configure);
      elements.forEach(element => element.classList.remove(styles.revealEntering));
    };
  }, []);

  return null;
}
