import { useState } from 'react';
import Icon from '../components/Icon.jsx';
import Modal from '../components/Modal.jsx';
import { useToast } from '../components/Toasts.jsx';
import * as B from '../data/budget.js';

/** Months (across all years) where any of these item ids has a budget or paid amount. */
function monthsWithAmounts(data, ids) {
  let count = 0;
  for (const y of Object.values(data.years)) for (const m of Object.values(y)) if (ids.some((id) => B.itemHasAmounts(m, id))) count++;
  return count;
}

function EditableName({ value, onSave, label, className = '' }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  if (!editing) {
    return (
      <span className={`row ${className}`} style={{ gap: 4, flexWrap: 'nowrap', minWidth: 0 }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
        <button className="iconbtn" type="button" aria-label={`Rename ${label}`} onClick={() => { setText(value); setEditing(true); }}>
          <Icon name="edit" size={14} />
        </button>
      </span>
    );
  }
  const save = () => {
    if (text.trim() && text.trim() !== value) onSave(text.trim());
    setEditing(false);
  };
  return (
    <form className="inline-form" style={{ flex: 1 }} onSubmit={(e) => { e.preventDefault(); save(); }}>
      <input className="input" autoFocus aria-label={`New name for ${label}`} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setEditing(false)} style={{ height: 32 }} />
      <button className="btn sm primary" type="submit">Save</button>
      <button className="btn sm ghost" type="button" onClick={() => setEditing(false)}>Cancel</button>
    </form>
  );
}

function AddForm({ placeholder, onAdd }) {
  const [text, setText] = useState('');
  return (
    <form
      className="li inline-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        onAdd(text.trim());
        setText('');
      }}
    >
      <input className="input" placeholder={placeholder} aria-label={placeholder} value={text} onChange={(e) => setText(e.target.value)} />
      <button className="btn sm" type="submit"><Icon name="plus" size={14} /> Add</button>
    </form>
  );
}

/** "Hide it" vs "Delete everywhere" choice for a bill/bucket or a whole group. */
function RemoveDialog({ target, data, onHide, onDelete, onClose }) {
  const months = monthsWithAmounts(data, target.ids);
  return (
    <Modal
      title={target.isGroup ? `Remove the ${target.label} group?` : `Remove ${target.label}?`}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" type="button" onClick={onClose}>Cancel</button>
          <button className="btn danger" type="button" onClick={() => { onDelete(); onClose(); }}>Delete everywhere</button>
          {!target.hidden && (
            <button className="btn primary" type="button" onClick={() => { onHide(); onClose(); }}>
              <Icon name="archive" size={15} /> Hide it
            </button>
          )}
        </>
      }
    >
      <p>
        {target.isGroup ? `Everything in ${target.label}` : target.label} is part of every month.
        {months > 0 ? ` It has amounts in ${months} ${months === 1 ? 'month' : 'months'}.` : ' It has no amounts in any month yet.'}
      </p>
      {!target.hidden && (
        <div className="card flat pad stack tight" style={{ gap: 4 }}>
          <b>Hide it (recommended)</b>
          <span className="muted small">It disappears from months where it has no amounts. Months where you used it keep it, so your past totals don’t change. You can show it again any time.</span>
        </div>
      )}
      <div className="card flat pad stack tight" style={{ gap: 4 }}>
        <b className="t-spend">Delete everywhere</b>
        <span className="muted small">
          Removes it from every month.{months > 0 ? ' Past totals will go down by its amounts.' : ''} This is what the old app always did.
        </span>
      </div>
    </Modal>
  );
}

function GroupsCard({ data, update, type, title, word }) {
  const toast = useToast();
  const [removing, setRemoving] = useState(null);
  const groups = data.categories[type];
  const restore = (before) => () => update((d) => ({ ...d, categories: { ...d.categories, [type]: before } }));

  return (
    <section className="card">
      <div className="card-head"><div><h2>{title}</h2><p className="sub">Shown in every month</p></div></div>
      <div className="list">
        {groups.length === 0 && <p className="empty">No groups yet. Add one below.</p>}
        {groups.map((g) => (
          <div key={g.id}>
            <div className="group-label">
              <EditableName value={g.label} label={g.label} onSave={(label) => update((d) => B.renameGroup(d, type, g.id, label))} />
              <span className="row" style={{ gap: 2, flexWrap: 'nowrap' }}>
                {g.archived && (
                  <button className="btn sm ghost" type="button" onClick={() => update((d) => B.setGroupHidden(d, type, g.id, false))}>Show again</button>
                )}
                <button className="iconbtn del" type="button" aria-label={`Remove group ${g.label}`} onClick={() => setRemoving({ isGroup: true, groupId: g.id, label: g.label, hidden: g.archived, ids: (g.items || []).map((i) => i.id) })}>
                  <Icon name="trash" size={14} />
                </button>
              </span>
            </div>
            {g.archived && <p className="hint" style={{ borderTop: 0 }}><Icon name="archive" size={14} /> Hidden: only shows in months where it has amounts.</p>}
            {(g.items || []).map((i) => (
              <div className="li" key={i.id} style={{ paddingBlock: 6 }}>
                <div className="grow"><EditableName value={i.label} label={i.label} onSave={(label) => update((d) => B.renameItem(d, type, g.id, i.id, label))} /></div>
                {i.archived && (
                  <>
                    <span className="chip">Hidden</span>
                    <button className="btn sm ghost" type="button" onClick={() => update((d) => B.setItemHidden(d, type, g.id, i.id, false))}>Show again</button>
                  </>
                )}
                <button className="iconbtn del" type="button" aria-label={`Remove ${i.label}`} onClick={() => setRemoving({ groupId: g.id, itemId: i.id, label: i.label, hidden: i.archived, ids: [i.id] })}>
                  <Icon name="trash" size={15} />
                </button>
              </div>
            ))}
            <AddForm placeholder={`Add ${word} to ${g.label}`} onAdd={(label) => update((d) => B.addItem(d, type, g.id, label))} />
          </div>
        ))}
        <div className="group-label">New group</div>
        <AddForm placeholder={`Group name, e.g. ${type === 'fixed' ? 'Utilities' : 'Investments'}`} onAdd={(label) => update((d) => B.addGroup(d, type, label))} />
      </div>
      {removing && (
        <RemoveDialog
          target={removing}
          data={data}
          onClose={() => setRemoving(null)}
          onHide={() => {
            const before = groups;
            update((d) => (removing.isGroup ? B.setGroupHidden(d, type, removing.groupId, true) : B.setItemHidden(d, type, removing.groupId, removing.itemId, true)));
            toast(`${removing.label} hidden`, { onUndo: restore(before) });
          }}
          onDelete={() => {
            const before = groups;
            update((d) => (removing.isGroup ? B.deleteGroup(d, type, removing.groupId) : B.deleteItem(d, type, removing.groupId, removing.itemId)));
            toast(`${removing.label} deleted`, { onUndo: restore(before), duration: 10000 });
          }}
        />
      )}
    </section>
  );
}

function StartingCategoriesCard({ data, update }) {
  const list = B.startingCategories(data);
  const set = (next) => update((d) => B.setStartingCategories(d, next));
  return (
    <section className="card">
      <div className="card-head"><div><h2>Starting spending categories</h2><p className="sub">Every month of a newly added year starts with these</p></div></div>
      <div className="list">
        {list.map((c) => (
          <div className="li" key={c.id} style={{ paddingBlock: 6 }}>
            <div className="grow"><EditableName value={c.label} label={c.label} onSave={(label) => set(list.map((x) => (x.id === c.id ? { ...x, label } : x)))} /></div>
            <button className="iconbtn del" type="button" aria-label={`Remove ${c.label}`} onClick={() => set(list.filter((x) => x.id !== c.id))}>
              <Icon name="trash" size={15} />
            </button>
          </div>
        ))}
        <AddForm placeholder="Add a starting category" onAdd={(label) => set([...list, { id: B.makeId(label), label }])} />
      </div>
      <p className="hint"><Icon name="info" size={15} /><span>Months you already have keep their own categories. Change those on the Budget page.</span></p>
    </section>
  );
}

export default function SettingsCategories({ data, update }) {
  return (
    <div className="grid-2 top">
      <GroupsCard data={data} update={update} type="fixed" title="Bills" word="a bill" />
      <div className="stack">
        <GroupsCard data={data} update={update} type="savings" title="Savings buckets" word="a bucket" />
        <StartingCategoriesCard data={data} update={update} />
      </div>
    </div>
  );
}
