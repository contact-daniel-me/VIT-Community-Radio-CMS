import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Scroll to the section named in the URL hash.
 *
 * React Router does not do this. A <Link to="/#about"> updates the location and
 * stops there, so the header tabs changed the address bar and left the page
 * exactly where it was -- they looked broken. Plain <a href="#about"> anchors,
 * like the ones in the footer, still jump natively, which is why only the tabs
 * appeared dead.
 *
 * `ready` matters: on a cold load of /#episodes the section exists but is the
 * wrong height until the data arrives, so scrolling immediately lands in the
 * wrong place. Passing the loaded flag re-runs the scroll once the content is
 * really there.
 *
 * location.key is in the dependencies so clicking the same tab twice works --
 * the hash has not changed, but the navigation has.
 */
export function useHashScroll(ready = true): void {
  const { hash, key } = useLocation();

  useEffect(() => {
    if (!hash || !ready) return;

    const id = decodeURIComponent(hash.slice(1));
    const target = document.getElementById(id);
    if (!target) return;

    // A frame's grace so layout has settled before the position is measured.
    const raf = requestAnimationFrame(() => {
      target.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'auto'
          : 'smooth',
        block: 'start',
      });
    });

    return () => cancelAnimationFrame(raf);
  }, [hash, key, ready]);
}
