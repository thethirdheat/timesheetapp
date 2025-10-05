
import { useEffect, useState } from "react";
import { useAuthenticator } from '@aws-amplify/ui-react';
import type { Schema } from "../amplify/data/resource";
import { generateClient } from "aws-amplify/data";
import TimesheetForm from "./components/TimesheetForm";

const client = generateClient<Schema>();

function App() {
  const { user, signOut } = useAuthenticator();
  const [timesheet, setTimesheet] = useState<Array<Schema["Timesheet"]["type"]>>([]);
  const [lineItemsMap, setLineItemsMap] = useState<Record<string, Array<Schema["LineItem"]["type"]>>>({});

  useEffect(() => {
    client.models.Timesheet.observeQuery().subscribe({
      next: (data) => setTimesheet([...data.items]),
    });
  }, []);

  // load entries for a list of todo ids and store them in entriesMap
  async function loadLineItemsForTimesheetIds(ids: string[]) {
    const map: Record<string, Array<Schema["LineItem"]["type"]>> = {};
    await Promise.all(
      ids.map(async (id) => {
        try {
          const res = await client.models.LineItem.list({ filter: { timesheetId: { eq: id } } });
          // generated client returns { data: [...] }
          // fall back to empty array if missing
          // @ts-ignore -- defensive, shape may vary by runtime
          map[id] = res.data ?? [];
        } catch (e) {
          // on error, set empty array so UI remains stable
          map[id] = [];
        }
      })
    );
    setLineItemsMap((prev) => ({ ...prev, ...map }));
  }

  // whenever todos change, load entries for them
  useEffect(() => {
    if (timesheet.length === 0) return;
    const ids = timesheet.map((t) => t.id);
    loadLineItemsForTimesheetIds(ids);
  }, [timesheet]);

  function createTodo() {
    client.models.Timesheet.create({ description: window.prompt("Todo content") });
  }

  function deleteTodo(id: string) {
    // client.models.Timesheet.delete({ id })
    client.models.LineItem.create({ date: "2024-06-20", minutes: 60, timesheetId: id });
  }
  function createLineItem() {
    // client.models.Todo.list()
    console.log(timesheet);
  }

  return (
    <main>
      <h1>{user?.signInDetails?.loginId}'s todos</h1>
      <button onClick={createTodo}>+ new</button>
      {/* <ul>
        {timesheet.map((timesheet) => (
          <li
            key={timesheet.id}
            onClick={() => deleteTodo(timesheet.id)}>
            <div>{timesheet.description}</div>
            <ul>
              {(lineItemsMap[timesheet.id] ?? []).map((entry) => (
                <li key={entry.id}>{entry.date} — {entry.minutes} minutes</li>
              ))}
            </ul>
          </li>
        ))}
      </ul> */}
      <TimesheetForm />
      <button onClick={signOut}>Sign out</button>
      <button onClick={createLineItem}>Create lineitem</button>
    </main>
  );
}

export default App;
