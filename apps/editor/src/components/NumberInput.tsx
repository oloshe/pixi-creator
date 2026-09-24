import { useEffect, useRef, useState } from 'react';

export interface NumberInputProps {
  value?: number;
  onChange(value: number): void;
  /** Called when the field is cleared (and `value` should become undefined). */
  onClear?(): void;
  min?: number;
  max?: number;
  disabled?: boolean;
  /** Arrow-key step; a number for fixed steps, otherwise 1. */
  step?: number | 'any';
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}

const PLAIN_NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)$/;
const EXPRESSION = /^[0-9+\-*/().\s]+$/;

/**
 * Evaluates a plain number or a simple arithmetic expression (`200 + 20`,
 * `20 / 2`, `(20 + 4) * 2`). Only digits and the four operators / parentheses
 * are ever allowed, so the expression is safe to evaluate with `Function`.
 */
export function evaluateNumericExpression(text: string): number | null {
  const trimmed = text.trim();

  if (trimmed === '') {
    return null;
  }

  if (PLAIN_NUMBER.test(trimmed)) {
    const number = Number(trimmed);
    return Number.isFinite(number) ? number : null;
  }

  if (!EXPRESSION.test(trimmed) || !/\d/.test(trimmed)) {
    return null;
  }

  try {
    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${trimmed});`)() as unknown;
    return typeof result === 'number' && Number.isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }
  // Trim float noise (0.30000000000000004 → 0.3) without dropping precision.
  return String(Number(value.toFixed(6)));
}

/**
 * Generic numeric field: type a plain number or an arithmetic expression and it
 * is evaluated on blur/Enter (`200 + 20` → 220, `20 / 2` → 10). Arrow keys step
 * the committed value. Used by the Inspector, Scene Settings and Toolbar.
 */
export function NumberInput({
  value,
  onChange,
  onClear,
  min,
  max,
  disabled,
  step = 'any',
  placeholder = 'Auto',
  className,
  ariaLabel,
}: NumberInputProps) {
  const [draft, setDraft] = useState<string>(value === undefined ? '' : formatNumber(value));
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLInputElement | null>(null);

  // Keep the draft in sync with external updates while the field is not edited.
  useEffect(() => {
    if (!focused) {
      setDraft(value === undefined ? '' : formatNumber(value));
    }
  }, [value, focused]);

  const clamp = (number: number): number =>
    Math.max(min ?? -Infinity, Math.min(max ?? Infinity, number));

  const commit = () => {
    const trimmed = draft.trim();

    if (trimmed === '') {
      if (onClear) {
        onClear();
        setDraft('');
      } else {
        setDraft(value === undefined ? '' : formatNumber(value));
      }
      setFocused(false);
      return;
    }

    const evaluated = evaluateNumericExpression(trimmed);

    if (evaluated === null) {
      // Invalid expression — revert to the last committed value.
      setDraft(value === undefined ? '' : formatNumber(value));
      setFocused(false);
      return;
    }

    const next = clamp(evaluated);
    onChange(next);
    setDraft(formatNumber(next));
    setFocused(false);
  };

  const stepValue = (direction: 1 | -1) => {
    const amount = typeof step === 'number' ? step : 1;
    const current = typeof value === 'number' && Number.isFinite(value) ? value : 0;
    const next = clamp(current + direction * amount);
    onChange(next);
    setDraft(formatNumber(next));
  };

  return (
    <input
      ref={ref}
      value={draft}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      spellCheck={false}
      placeholder={placeholder}
      disabled={disabled}
      aria-label={ariaLabel}
      className={className}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
          ref.current?.blur();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          setDraft(value === undefined ? '' : formatNumber(value));
          setFocused(false);
          ref.current?.blur();
        } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault();
          stepValue(event.key === 'ArrowUp' ? 1 : -1);
        }
      }}
    />
  );
}
