import { useEffect, type ReactNode } from 'react';

export interface ModalProps {
  title: string;
  onClose(): void;
  children?: ReactNode;
  footer?: ReactNode;
}

/**
 * Generic modal: a backdrop + centred dialog with a title, body and optional
 * footer actions. Shares the editor's dark theme. Closes on backdrop click or
 * Escape. `PromptDialog` covers text input; use this for confirmations and
 * richer dialogs.
 */
export function Modal({ title, onClose, children, footer }: ModalProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="promptBackdrop" onMouseDown={onClose}>
      <div className="modalDialog" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <h2>{title}</h2>
        {children ? <div className="modalBody">{children}</div> : null}
        {footer ? <div className="promptActions">{footer}</div> : null}
      </div>
    </div>
  );
}
