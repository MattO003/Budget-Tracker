import { useEffect, useRef } from 'react';
import Icon from './Icon.jsx';

/**
 * Dialog with a title bar; closes on Escape or a click on the backdrop.
 * Pass onSubmit to make the body + footer one form (Enter submits).
 */
export default function Modal({ title, onClose, children, footer, size, onSubmit, drawer = false, focusFirst = true }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Runs once when opened: focus the first field and listen for Escape.
  useEffect(() => {
    // Escape closes only the top-most dialog (e.g. a confirm opened from a side panel).
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      const all = document.querySelectorAll('[role="dialog"]');
      if (all[all.length - 1] === ref.current) closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    // A side panel focuses itself (no keyboard popping up on phones); a form focuses its first field.
    const first = focusFirst ? ref.current?.querySelector('input, select, textarea, button.primary') : ref.current;
    first?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className={`scrim ${drawer ? 'drawer' : ''}`} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${size || ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref} tabIndex={-1}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="iconbtn" type="button" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        {onSubmit ? (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit(e);
            }}
          >
            <div className="modal-body">{children}</div>
            {footer && <div className="modal-foot">{footer}</div>}
          </form>
        ) : (
          <>
            <div className="modal-body">{children}</div>
            {footer && <div className="modal-foot">{footer}</div>}
          </>
        )}
      </div>
    </div>
  );
}
