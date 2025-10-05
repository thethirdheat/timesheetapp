import { useState } from 'react';
import { Link } from 'react-router-dom';
import LineItem from './LineItem';

export default function TimesheetForm() {
  const [store, setStore] = useState({
    "timesheetId": "timesheetId",
    "description": "freformtext",
    "rate": 3,
    "lineItems": {}
  });

  const handleAddLineItem = () => {
    const newId = `lineItem_${Date.now()}`;
    setStore(prevStore => ({
      ...prevStore,
      lineItems: {
        ...prevStore.lineItems,
        [newId]: { date: "", minutesCount: 0 }
      }
    }));
  };

  const handleRemoveLineItem = (key) => {
    setStore(prevStore => {
      const updatedLineItems = { ...prevStore.lineItems };
      delete updatedLineItems[key];
      return {
        ...prevStore,
        lineItems: updatedLineItems
      };
    });
  };

  const handleDateChange = (key, newDate) => {
    setStore(prevStore => ({
      ...prevStore,
      lineItems: {
        ...prevStore.lineItems,
        [key]: {
          ...prevStore.lineItems[key],
          date: newDate
        }
      }
    }));
  };

  const handleMinutesChange = (key, newMinutes) => {
    const minutes = Math.max(0, Number(newMinutes) || 0);
    setStore(prevStore => ({
      ...prevStore,
      lineItems: {
        ...prevStore.lineItems,
        [key]: {
          ...prevStore.lineItems[key],
          minutesCount: minutes
        }
      }
    }));
  };

  const totalMinutes = Object.values(store.lineItems)
    .reduce((sum, item) => sum + (Number(item.minutesCount) || 0), 0);

  const totalCost = store.rate * totalMinutes;

  return (
    <div>
      <div style={{ marginBottom: "16px" }}>
        <Link to="/">← Back to Users</Link>
      </div>

      <textarea
        value={store.description}
        onChange={e =>
          setStore(prevStore => ({
            ...prevStore,
            description: e.target.value
          }))
        }
        rows={3}
        style={{ width: "100%", marginBottom: "16px" }}
      />

      <button onClick={handleAddLineItem} style={{ marginBottom: "16px" }}>
        Add Line Item
      </button>

      {Object.entries(store.lineItems)
        .sort(([, a], [, b]) => new Date(a.date) - new Date(b.date))
        .map(([key, value]) => (
          <div key={key} style={{ display: "flex", alignItems: "center", marginBottom: "8px" }}>
            <LineItem
              lineDetails={value}
              lineKey={key}
              onDateChange={handleDateChange}
              onMinutesChange={handleMinutesChange}
            />
            <button
              onClick={() => handleRemoveLineItem(key)}
              style={{ marginLeft: "8px" }}
              aria-label="Remove line item"
            >
              Remove
            </button>
          </div>
        ))}

      <div style={{ marginTop: "16px" }}>
        <label>
          <span style={{ fontWeight: "bold" }}>Rate: </span>
          <input
            type="number"
            min="0"
            value={store.rate}
            onChange={e =>
              setStore(prevStore => ({
                ...prevStore,
                rate: Math.max(0, Number(e.target.value) || 0)
              }))
            }
            style={{ width: "80px", marginLeft: "8px" }}
          />
        </label>
      </div>

      <div style={{ marginTop: "16px", fontWeight: "bold" }}>
        Total Minutes: {totalMinutes}
      </div>

      <div style={{ marginTop: "8px", fontWeight: "bold" }}>
        Total Cost: {totalCost}
      </div>
    </div>
  );
}