import { useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";

const ScrollToTop = () => {
  const { pathname, search, hash } = useLocation();

  useLayoutEffect(() => {
    if (hash) {
      return;
    }

    const reset = () => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };
    reset();
    const frame = requestAnimationFrame(reset);
    const nextFrame = requestAnimationFrame(() => requestAnimationFrame(reset));
    const timers = [0, 25, 100].map((delay) => window.setTimeout(reset, delay));
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(nextFrame);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [pathname, search, hash]);

  return null;
};

export default ScrollToTop;
