import Modal from './Modal.jsx';

/** Replaces the browser's confirm(): says exactly what will happen, with a clearly labelled action. */
export default function ConfirmDialog({ title, children, confirmLabel, danger = false, onConfirm, onClose }) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" type="button" onClick={onClose}>Cancel</button>
          <button
            className={`btn ${danger ? 'danger solid' : 'primary'}`}
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      {children}
    </Modal>
  );
}
