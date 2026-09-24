import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface ContextMenuItem {
  key: string;
  label: string;
  disabled?: boolean;
  danger?: boolean;
  onSelect(): void;
}

export interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose(): void;
}

/**
 * Lightweight context menu: renders at the pointer, closes on outside click or
 * Escape. Its position is measured and clamped into the viewport — near the
 * right/bottom edges it flips to right/bottom alignment so it never overflows
 * off screen.
 */
export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const element = ref.current;

    if (!element) {
      return;
    }

    const rect = element.getBoundingClientRect();
    const pad = 4;
    let left = x;
    let top = y;

    if (x + rect.width > window.innerWidth - pad) {
      left = Math.max(pad, x - rect.width);
    }

    if (y + rect.height > window.innerHeight - pad) {
      top = Math.max(pad, y - rect.height);
    }

    setPosition({ left, top });
  }, [x, y]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="contextMenu"
      role="menu"
      style={{ left: position.left, top: position.top }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          role="menuitem"
          className={`contextMenuItem ${item.danger ? 'danger' : ''}`}
          disabled={item.disabled}
          onClick={() => {
            onClose();
            item.onSelect();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
