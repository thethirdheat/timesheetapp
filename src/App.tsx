import { useEffect, useState, useRef } from "react";
import { useAuthenticator } from '@aws-amplify/ui-react';
import type { Schema } from "../amplify/data/resource";
import { generateClient } from "aws-amplify/data";
import LineItem, { LineDetails } from './components/LineItem';

const client = generateClient<Schema>();

type TimesheetStore = {
  timesheetId: string;
  description: string;
  rate: number;
  lineItems: Record<string, LineDetails>;
};

function App() {
  const { user, signOut } = useAuthenticator();
  const [timesheet, setTimesheet] = useState<Array<Schema["Timesheet"]["type"]>>([]);

  // start with an empty store; we'll populate from the backend Timesheet record when available
  const [store, setStore] = useState<TimesheetStore>({
    timesheetId: '',
    description: '',
    rate: 0,
    lineItems: {},
  });

  // whether the user is actively editing the description (prevents overwriting by backend sync)
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const isEditingRef = useRef(isEditingDescription);
  useEffect(() => { isEditingRef.current = isEditingDescription; }, [isEditingDescription]);
  // track edits to rate too
  const [isEditingRate, setIsEditingRate] = useState(false);
  const isEditingRateRef = useRef(isEditingRate);
  useEffect(() => { isEditingRateRef.current = isEditingRate; }, [isEditingRate]);

  // track which line items are currently being edited (to avoid overwriting with backend updates)
  const editingLineItemsRef = useRef<Record<string, boolean>>({});
  // per-line-item debounce timers
  const lineItemSaveTimersRef = useRef<Record<string, number | null>>({});

  // always-visible form state for creating a new LineItem
  const [newLine, setNewLine] = useState<LineDetails>({ date: '', minutesCount: 0 });
  const [isSaving, setIsSaving] = useState(false);

  // ref that always points to the latest store (useful in async handlers)
  const storeRef = useRef(store);
  useEffect(() => { storeRef.current = store; }, [store]);

  // ref to hold the debounce timer id
  const saveTimeoutRef = useRef<number | null>(null);


  useEffect(() => {
    client.models.Timesheet.observeQuery().subscribe({
      next: (data) => {
        const items = [...data.items];
        setTimesheet(items);

        // if multiple Timesheet records exist for this user, keep the first and delete the rest
        if (items.length > 1) {
          (async () => {
            for (const extra of items.slice(1)) {
              try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const id = (extra as any)?.id;
                if (id) {
                  await client.models.Timesheet.delete({ id });
                }
              } catch (e) {
                // ignore deletion errors
              }
            }
            // ensure local state shows only the first
            setTimesheet([items[0]]);
          })();
        }
      },
    });
  }, []);

  const handleAddLineItem = async () => {
    try {
      // ensure timesheet exists
      let timesheetId = storeRef.current.timesheetId;
      if (!timesheetId) {
        const res = await client.models.Timesheet.create({ description: storeRef.current.description, rate: storeRef.current.rate });
        const createdId = extractIdFromResponse(res);
        if (createdId) {
          timesheetId = createdId;
          setStore(prev => ({ ...prev, timesheetId }));
        }
      }

      if (!timesheetId) return;

      // create the LineItem using the always-visible form values
      const created = await client.models.LineItem.create({ date: newLine.date, minutes: newLine.minutesCount, timesheetId });
      const backendId = extractIdFromResponse(created) ?? `li_${Date.now()}`;

      // add to local store
      setStore(prev => ({
        ...prev,
        lineItems: {
          ...prev.lineItems,
          [backendId]: { date: newLine.date, minutesCount: newLine.minutesCount },
        },
      }));

      // reset the new-line form
      setNewLine({ date: '', minutesCount: 0 });

      // refresh to pick up canonical data
      await loadLineItemsForTimesheetId(timesheetId);
    } catch (e) {
      // swallow for now
    }
  };

  const handleRemoveLineItem = async (key: string) => {
    // remove locally first for snappy UI
    setStore(prevStore => {
      const updatedLineItems = { ...prevStore.lineItems };
      delete updatedLineItems[key];
      return {
        ...prevStore,
        lineItems: updatedLineItems,
      };
    });

    // if this looks like a backend id, delete remotely as well
    if (!key.startsWith('lineItem_')) {
      try {
        await client.models.LineItem.delete({ id: key });
      } catch (e) {
        // ignore delete errors for now
      }
    }
  };

  const handleDateChange = (key: string, newDate: string) => {
    // mark editing
    editingLineItemsRef.current[key] = true;

    setStore(prevStore => ({
      ...prevStore,
      lineItems: {
        ...prevStore.lineItems,
        [key]: {
          ...prevStore.lineItems[key],
          date: newDate,
        },
      },
    }));

    // debounce save for this line item
    if (lineItemSaveTimersRef.current[key]) {
      window.clearTimeout(lineItemSaveTimersRef.current[key] as number);
    }
    lineItemSaveTimersRef.current[key] = window.setTimeout(async () => {
      try {
        if (!key.startsWith('lineItem_')) {
          await client.models.LineItem.update({ id: key, date: newDate });
        }
      } catch (e) {
        // ignore
      } finally {
        editingLineItemsRef.current[key] = false;
        lineItemSaveTimersRef.current[key] = null;
      }
    }, 700);
  };

  const handleMinutesChange = (key: string, newMinutes: string | number) => {
    const minutes = Math.max(0, Number(newMinutes) || 0);
    // mark editing
    editingLineItemsRef.current[key] = true;

    setStore(prevStore => ({
      ...prevStore,
      lineItems: {
        ...prevStore.lineItems,
        [key]: {
          ...prevStore.lineItems[key],
          minutesCount: minutes,
        },
      },
    }));

    // debounce save for this line item
    if (lineItemSaveTimersRef.current[key]) {
      window.clearTimeout(lineItemSaveTimersRef.current[key] as number);
    }
    lineItemSaveTimersRef.current[key] = window.setTimeout(async () => {
      try {
        if (!key.startsWith('lineItem_')) {
          await client.models.LineItem.update({ id: key, minutes: minutes });
        }
      } catch (e) {
        // ignore
      } finally {
        editingLineItemsRef.current[key] = false;
        lineItemSaveTimersRef.current[key] = null;
      }
    }, 700);
  };

  const totalMinutes = Object.values(store.lineItems).reduce(
    (sum, item) => sum + (Number(item.minutesCount) || 0),
    0,
  );

  const totalCost = store.rate * totalMinutes;


  // Persist description changes (debounced)
  useEffect(() => {
    // clear any existing timer
    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    // schedule save 700ms after user stops typing
    saveTimeoutRef.current = window.setTimeout(async () => {
      try {
        // If we have a timesheetId that looks like an existing record, try update
        if (store.timesheetId && !store.timesheetId.startsWith('timesheet_')) {
          // attempt update
          await client.models.Timesheet.update({ id: store.timesheetId, description: store.description, rate: store.rate });
          // mark saved
          setIsEditingDescription(false);
          setIsEditingRate(false);
        } else {
          // otherwise create a new timesheet in the backend
          const res = await client.models.Timesheet.create({ description: store.description, rate: store.rate });
          const createdId = extractIdFromResponse(res);
          if (createdId) {
            setStore(prev => ({ ...prev, timesheetId: createdId }));
          }
          // mark saved
          setIsEditingDescription(false);
          setIsEditingRate(false);
        }
      } catch (e) {
        // swallow errors for now (could wire notifications later)
        // console.error('failed saving timesheet', e);
      }
    }, 700);

    return () => {
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, [store.description, store.rate]);

  // load LineItem records for a Timesheet and convert them to the local `lineItems` shape
  async function loadLineItemsForTimesheetId(id: string) {
    try {
      const res = await client.models.LineItem.list({ filter: { timesheetId: { eq: id } } });
      // accomodate different runtime shapes
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const itemsAny: any = (res as any)?.data ?? (res as any) ?? [];
      setLineItemsFromArray(itemsAny);
    } catch (e) {
      // on error, keep existing store.lineItems
    }
  }

  // helper: convert array-like items (from list or embedded relation) into the local record shape
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function setLineItemsFromArray(itemsAny: any[]) {
    const record: Record<string, LineDetails> = {};
    for (const it of itemsAny ?? []) {
      if (!it) continue;
      const itemId = (it.id ?? it.ID ?? it.id ?? String(Date.now())) as string;
      record[itemId] = {
        date: it.date ?? it.Date ?? '',
        minutesCount: Number(it.minutes ?? it.minutesCount ?? 0),
      };
    }
    setStore(prev => {
      // merge backend records but keep any line items that are currently being edited locally
      const merged: Record<string, LineDetails> = { ...record };
      for (const k of Object.keys(prev.lineItems)) {
        if (editingLineItemsRef.current[k]) {
          merged[k] = prev.lineItems[k];
        }
      }
      return { ...prev, lineItems: merged };
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function extractIdFromResponse(obj: any, depth = 0): string | null {
    if (!obj || depth > 6) return null;
    if (typeof obj === 'string') return null;
    if (typeof obj === 'object') {
      if (typeof obj.id === 'string') return obj.id;
      if (obj.data) return extractIdFromResponse(obj.data, depth + 1);
      for (const key of Object.keys(obj)) {
        const val = obj[key];
        if (val && typeof val === 'object') {
          const found = extractIdFromResponse(val, depth + 1);
          if (found) return found;
        }
      }
    }
    return null;
  }

  // Force-save everything: Timesheet + all LineItems (create or update), replacing temp keys
  async function handleSaveAll() {
    if (isSaving) return;
    setIsSaving(true);
    try {
      // clear pending debounced saves
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      for (const k of Object.keys(lineItemSaveTimersRef.current)) {
        const t = lineItemSaveTimersRef.current[k];
        if (t) {
          window.clearTimeout(t as number);
          lineItemSaveTimersRef.current[k] = null;
        }
      }

      // ensure Timesheet exists or update it
      let timesheetId = storeRef.current.timesheetId;
      if (!timesheetId) {
        const res = await client.models.Timesheet.create({ description: storeRef.current.description, rate: storeRef.current.rate });
        const createdId = extractIdFromResponse(res);
        if (createdId) {
          timesheetId = createdId;
          setStore(prev => ({ ...prev, timesheetId }));
        }
      } else {
        try {
          await client.models.Timesheet.update({ id: timesheetId, description: storeRef.current.description, rate: storeRef.current.rate });
        } catch (e) {
          // ignore
        }
      }

      // Persist all line items: create those with temp keys, update backend ones
      const current = { ...storeRef.current.lineItems };
      const newMap: Record<string, LineDetails> = {};
      for (const [key, val] of Object.entries(current)) {
        try {
          if (key.startsWith('lineItem_')) {
            // create
            if (!timesheetId) continue;
            const created = await client.models.LineItem.create({ date: val.date, minutes: val.minutesCount, timesheetId });
            const createdId = extractIdFromResponse(created) ?? `li_${Date.now()}`;
            newMap[createdId] = val;
          } else {
            // update
            try {
              await client.models.LineItem.update({ id: key, date: val.date, minutes: val.minutesCount });
            } catch (e) {
              // ignore
            }
            newMap[key] = val;
          }
        } catch (e) {
          // on error, keep the local value under its key
          newMap[key] = val;
        }
      }

      // clear editing flags for items we just saved
      for (const k of Object.keys(editingLineItemsRef.current)) editingLineItemsRef.current[k] = false;

      // update local store with canonical ids
      setStore(prev => ({ ...prev, timesheetId: timesheetId ?? prev.timesheetId, lineItems: newMap }));

      // refresh from backend to be safe
      if (timesheetId) await loadLineItemsForTimesheetId(timesheetId);
    } finally {
      setIsSaving(false);
    }
  }

  // when the list of Timesheet records changes, pick the first one and populate the store from it
  useEffect(() => {
    if (!timesheet || timesheet.length === 0) return;
    const first = timesheet[0];
    if (!first) return;
    setStore(prev => {
      const updated: TimesheetStore = { ...prev };
      updated.timesheetId = (first as any)?.id ?? prev.timesheetId;
      // only overwrite description/rate from backend when user is NOT currently editing
      if (!isEditingRef.current) {
        updated.description = (first as any)?.description ?? prev.description;
        updated.rate = Number(((first as any)?.rate ?? prev.rate));
      }
      return updated;
    });
    const id = (first as any)?.id;
    if (!id) return;

    // prefer embedded relation data if present (some runtimes include related items)
    // possible shapes: first.lineItems (array), first.lineItems.data (array), first.lineItems.items, etc.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const maybeEmbedded: any = (first as any)?.lineItems ?? (first as any)?.lineItems?.data ?? (first as any)?.lineItems?.items ?? null;
    if (Array.isArray(maybeEmbedded) && maybeEmbedded.length > 0) {
      setLineItemsFromArray(maybeEmbedded);
    } else {
      loadLineItemsForTimesheetId(id);
    }
  }, [timesheet]);


  return (
    <main>
      <h1>{user?.signInDetails?.loginId}'s timesheet</h1>

      <textarea
        value={store.description}
        onChange={e => {
          setIsEditingDescription(true);
          setStore(prevStore => ({
            ...prevStore,
            description: e.target.value,
          }));
        }
        }
        rows={3}
        style={{ width: '100%', marginBottom: '16px' }}
      />
      <hr></hr>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '16px' }}>
        <input
          type="date"
          value={newLine.date}
          onChange={e => setNewLine(prev => ({ ...prev, date: e.target.value }))}
          style={{ padding: '4px', width: '240px', position: 'relative', zIndex: 2, pointerEvents: 'auto' }}
        />
        <input
          type="number"
          min="0"
          value={newLine.minutesCount}
          onChange={e => setNewLine(prev => ({ ...prev, minutesCount: Math.max(0, Number(e.target.value) || 0) }))}
          style={{ width: '80px', padding: '4px' }}
        />
        minutes
        <button className="secondary contrast" onClick={handleAddLineItem} style={{ marginLeft: '192px', marginBottom: '16px' }}>
          Add Line Item
        </button>
      </div>
      <hr></hr>

      {Object.entries(store.lineItems)
        .sort(([, a], [, b]) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .map(([key, value]) => (
          <div
            key={key}
            style={{
              display: 'grid',
              gridTemplateColumns: '651px 100px',
              gap: '8px',
              alignItems: 'center',
            }}
          >
            <div style={{ width: '400px' }}>
              <LineItem
                lineDetails={value}
                lineKey={key}
                onDateChange={handleDateChange}
                onMinutesChange={handleMinutesChange}
              />
            </div>
            <div style={{ width: '100px', justifySelf: 'center' }}>
              <button
                className="secondary outline"
                onClick={() => handleRemoveLineItem(key)}
                aria-label="Remove line item"
                style={{ width: '110px', marginBottom: '16px', fontSize: '16px' }}
              >
                Remove
              </button>
            </div>
          </div>
        ))}


      <hr></hr>
      <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <label>
          <span >Rate: </span>
          <input
            type="number"
            min="0"
            value={store.rate}
            onChange={e => {
              setIsEditingRate(true);
              setStore(prevStore => ({
                ...prevStore,
                rate: Math.max(0, Number(e.target.value) || 0),
              }));
            }}
            style={{ width: '80px', marginLeft: '8px' }}
          />
        </label>

        <div style={{ marginBottom: '16px' }}>Total Minutes: {totalMinutes}</div>
      </div>


      <div style={{ display: 'flex', gap: '8px', marginTop: '12px', justifyContent: 'space-between' }}>
        <h3 style={{ marginTop: '8px', fontWeight: 'bold' }}>Total Cost: {totalCost}</h3>
        <button onClick={handleSaveAll} disabled={isSaving}>{isSaving ? 'Saving...' : 'Save All'}</button>
      </div>
      <hr></hr>
      <button style={{ marginTop: '16px' }} className="outline" onClick={signOut}>Sign out</button>
    </main>
  );
}

export default App;
