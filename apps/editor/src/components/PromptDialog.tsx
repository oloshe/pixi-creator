import { useEffect, useRef, useState } from 'react';

export interface PromptDialogProps {
  title: string;
  label: string;
  placeholder?: string;
  confirmLabel: string;
  cancelLabel: string;
  defaultValue?: string;
  onSubmit(value: string): void;
  onClose(): void;
}

/**
 * Minimal modal prompt shared by rename and script creation. Keeps the editor
 * dependency-free and gives text inputs a stable focus/Escape/Enter behaviour.
 */
export function PromptDialog({
  title,
  label,
  placeholder,
  confirmLabel,
  cancelLabel,
  defaultValue = '',
  onSubmit,
  onClose,
}: PromptDialogProps) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Focus/select once on mount. Re-running `select()` on every keystroke used to
  // re-select the whole text after each character, so the next character
  // replaced the previous one (the "can't type more than one character" bug).
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        onSubmit(value);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [value, onClose, onSubmit]);

  return (
    <div className="promptBackdrop" onMouseDown={onClose}>
      <div className="promptDialog" onMouseDown={(event) => event.stopPropagation()}>
        <h2>{title}</h2>
        <label>
          {label}
          <input
            ref={inputRef}
            value={value}
            placeholder={placeholder}
            onChange={(event) => setValue(event.target.value)}
          />
        </label>
        <div className="promptActions">
          <button type="button" className="primaryButton" disabled={!value.trim()} onClick={() => onSubmit(value)}>
            {confirmLabel}
          </button>
          <button type="button" onClick={onClose}>{cancelLabel}</button>
        </div>
      </div>
    </div>
  );
}
