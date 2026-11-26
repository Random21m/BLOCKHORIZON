// Block arrival: when a new block is mined, the mined blocks glide one slot along (FLIP: measure before, measure after,
// animate the difference), the new block slides in out of the divider, the projected queue fades in its new order, and the
// height rolls up into its new number. Calm and short, no flashing; nothing moves with reduce motion (setting or system) or in a hidden tab.
import { S } from './state.js';

const still = () =>
  S.reduced ||
  document.hidden ||
  (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
const heightOf = (a) => (a.querySelector('b') || {}).textContent;
const EASE = 'cubic-bezier(.2,.7,.2,1)';

// Where things are now (call before the page is updated). Only taken when the height changes, so ordinary updates cost nothing.
export function measure() {
  return {
    blocks: new Map(
      [...document.querySelectorAll('.strip2 a.blk:not(.proj)')].map((a) => [heightOf(a), a.getBoundingClientRect()])
    ),
  };
}
// Animate from the measured positions to the new ones (call right after the update). `moved` says what is new: the height,
// the mined blocks, or both. Returns how many elements were animated.
export function arrive(before, moved = { height: true, blocks: true }) {
  if (!before || still()) return 0;
  let n = 0;
  const mined = moved.blocks ? [...document.querySelectorAll('.strip2 a.blk:not(.proj)')] : [];
  const slot = mined.length > 1 ? mined[1].getBoundingClientRect().left - mined[0].getBoundingClientRect().left : 0;
  for (const a of mined) {
    const r = a.getBoundingClientRect(),
      was = before.blocks.get(heightOf(a));
    if (!r.width) continue;
    if (!was) {
      // the new block: out of the divider, one slot towards it
      a.animate(
        [
          { transform: `translateX(${-slot}px)`, opacity: 0 },
          { transform: 'none', opacity: 1 },
        ],
        { duration: 900, easing: EASE }
      );
      n++;
      continue;
    }
    const dx = was.left - r.left,
      dy = was.top - r.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
    a.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 900, easing: EASE });
    n++;
  }
  if (moved.blocks)
    for (const q of document.querySelectorAll('.strip2 .blk.proj')) {
      q.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 700, easing: EASE });
      n++;
    } // the queue moved up one block
  const h = document.getElementById('h');
  if (h && moved.height) {
    h.animate(
      [
        { transform: 'translateY(.3em)', opacity: 0, clipPath: 'inset(0 0 100% 0)' },
        { transform: 'none', opacity: 1, clipPath: 'inset(0 0 0 0)' },
      ],
      { duration: 650, easing: EASE }
    );
    n++;
  }
  return n;
}
