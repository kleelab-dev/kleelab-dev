'use client';

import { clsx } from 'clsx';
import { useEffect, useRef, useState } from 'react';

type State = 'idle' | 'below' | 'above' | 'in';

/**
 * Fades its children in whenever they scroll into view, from either
 * direction: up from below on the way down, down from above on the way back.
 *
 * Server HTML is fully visible. A block is only hidden once it is completely
 * off screen, so nothing flashes and the page reads fine without JS.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  as: Tag = 'div',
}: {
  children: React.ReactNode;
  className?: string;
  /** Milliseconds, for staggering siblings. */
  delay?: number;
  as?: 'div' | 'li' | 'section' | 'article';
}) {
  const ref = useRef<HTMLElement>(null);
  const [state, setState] = useState<State>('idle');
  const stateRef = useRef<State>('idle');

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;

    let timer = 0;
    const set = (next: State) => {
      stateRef.current = next;
      setState(next);
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        const rect = entry.boundingClientRect;
        const viewport = entry.rootBounds?.height ?? window.innerHeight;
        if (!entry.isIntersecting) {
          // Fully off screen: park it on the side it left from.
          set(rect.top < 0 ? 'above' : 'below');
          return;
        }
        const current = stateRef.current;
        if (current === 'idle' || current === 'in') return;
        if (entry.intersectionRatio < 0.15 && entry.intersectionRect.height <= 120) return;

        // A fast fling or an anchor jump can skip a block entirely, leaving it
        // parked on the wrong side. Move it to the side it is entering from
        // first, then let it slide in a moment later.
        const from: State = rect.top + rect.height / 2 < viewport / 2 ? 'above' : 'below';
        if (from !== current) {
          set(from);
          window.clearTimeout(timer);
          timer = window.setTimeout(() => set('in'), 40);
        } else {
          set('in');
        }
      },
      { threshold: [0, 0.15, 0.3] },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <Tag
      ref={ref as React.Ref<never>}
      className={clsx(
        state === 'below' && 'reveal-wait',
        state === 'above' && 'reveal-wait-above',
        state === 'in' && 'reveal-in',
        className,
      )}
      style={delay ? ({ '--reveal-delay': `${delay}ms` } as React.CSSProperties) : undefined}
    >
      {children}
    </Tag>
  );
}
