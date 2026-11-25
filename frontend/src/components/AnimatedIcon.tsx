import { useEffect, useRef, type FocusEvent, type MouseEvent, type PointerEvent } from 'react';
import UseAnimations, { type Animation, type EventProps, type Interaction } from 'react-useanimations';

export type { Animation as AnimatedIconData } from 'react-useanimations';

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

/**
 * An animated icon (react-useanimations), the same as in the DHSUD scheduler. It plays
 * when its button or link is hovered or focused with the keyboard, not only when the pointer is on
 * the small icon itself. It follows the text colour (currentColor), stays still for people who ask
 * for reduced motion, and is hidden from screen readers: the button or link around it has the label.
 */
export function AnimatedIcon(props: {
  animation: Animation;
  /** Width and height in pixels */
  size?: number;
  className?: string;
  /** Overrides the icon's own interaction (most icons here play once on hover) */
  interaction?: Interaction;
}) {
  const { animation, size = 16, className } = props;
  const own = animation.interaction;
  const interaction = props.interaction ?? (own?.startsWith('hover') ? own : 'hover-replay');
  const handlers = useRef<EventProps | null>(null);
  const iconRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const icon = iconRef.current;
    if (!icon || reducedMotion()) return;
    // The nearest button or link is the hover area; a bare icon is its own hover area.
    const host = icon.closest<HTMLElement>('a, button, [data-icon-host]') ?? icon;
    const fake = <T,>(extra: object = {}) => ({ defaultPrevented: false, currentTarget: host, ...extra }) as unknown as T;

    const enter = (event: globalThis.PointerEvent) => {
      handlers.current?.onPointerEnter(fake<PointerEvent<HTMLElement>>({ pointerType: event.pointerType }));
      if (host.matches(':disabled')) return;
      handlers.current?.onMouseEnter(fake<MouseEvent<HTMLElement>>());
    };
    const leave = () => handlers.current?.onMouseLeave(fake<MouseEvent<HTMLElement>>());
    const focus = () => {
      if (host.matches(':focus-visible')) handlers.current?.onMouseEnter(fake<MouseEvent<HTMLElement>>());
    };
    const blur = () => handlers.current?.onBlur(fake<FocusEvent<HTMLElement>>());

    host.addEventListener('pointerenter', enter);
    host.addEventListener('pointerleave', leave);
    host.addEventListener('focusin', focus);
    host.addEventListener('focusout', blur);
    return () => {
      host.removeEventListener('pointerenter', enter);
      host.removeEventListener('pointerleave', leave);
      host.removeEventListener('focusin', focus);
      host.removeEventListener('focusout', blur);
    };
  }, []);

  // These icons are drawn on a 32-unit grid with more empty edge than 24-unit icons, so draw them a
  // third larger and pull the margins in: the space taken stays `size`.
  const drawn = Math.round((size * 4) / 3);
  const pull = (size - drawn) / 2;

  return (
    <UseAnimations
      animation={animation}
      size={drawn}
      style={{ margin: pull }}
      interaction={interaction}
      render={(eventProps, animationProps) => {
        handlers.current = eventProps;
        const { ref: playerRef, ...rest } = animationProps;
        return (
          <span
            {...rest}
            aria-hidden="true"
            className={className ? `anim-icon ${className}` : 'anim-icon'}
            ref={(element) => {
              iconRef.current = element;
              playerRef(element);
            }}
          />
        );
      }}
    />
  );
}
