import { createContext, useCallback, useContext, useRef, useState } from 'react';

const ToastContext = createContext(() => {});

/** toast('Saved') or toast('Deleted Costco', { onUndo: () => ... }) */
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => setItems((list) => list.filter((t) => t.id !== id)), []);

  const toast = useCallback(
    (message, { onUndo, duration = 5000 } = {}) => {
      const id = nextId.current++;
      setItems((list) => [...list.slice(-2), { id, message, onUndo }]);
      setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((t) => (
          <div className="toast" key={t.id}>
            <span>{t.message}</span>
            {t.onUndo && (
              <button type="button" onClick={() => { t.onUndo(); dismiss(t.id); }}>
                Undo
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
