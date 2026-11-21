import { useEffect, useRef } from 'react';
import Icon from './Icon.jsx';

/** Dialog with a title bar; closes on Escape or a click on the backdrop. */
export default function Modal({ title, onClose, children, footer, size }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Runs once when opened: focus the first field and listen for Escape.
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && closeRef.current();
    document.addEventListener('keydown', onKey);
    const first = ref.current?.querySelector('input, select, textarea, button.primary');
    first?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${size || ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="iconbtn" type="button" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
