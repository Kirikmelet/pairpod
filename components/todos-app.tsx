"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

type Todo = {
  id: number | string;
  name: string;
};

type TodosAppProps = {
  variant?: "page" | "popup";
  onOpenApp?: () => void;
};

export function TodosApp({ variant = "page", onOpenApp }: TodosAppProps) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [status, setStatus] = useState("Loading todos...");
  const [isError, setIsError] = useState(false);

  const loadTodos = useCallback(async () => {
    setStatus("Loading todos...");
    setIsError(false);

    const supabase = createClient();
    const { data, error } = await supabase.from("todos").select("id, name");

    if (error) {
      setTodos([]);
      setStatus(error.message);
      setIsError(true);
      return;
    }

    setTodos((data ?? []) as Todo[]);
    setStatus(`${data?.length ?? 0} todo(s)`);
  }, []);

  useEffect(() => {
    void loadTodos();
  }, [loadTodos]);

  const isPopup = variant === "popup";

  return (
    <section className="app-panel">
      <div className="app-panel__body">
        <header className="app-header">
          <span className="app-eyebrow">Live pod</span>
          <h1 className={`app-title ${isPopup ? "app-title--sm" : ""}`}>
            Uncommon Hacks
          </h1>
          <p className={`status-note ${isError ? "status-note--error" : ""}`}>
            {status}
          </p>
        </header>

        <ul className="app-list">
          {todos.length === 0 ? (
            <li className="app-list__item app-list__item--empty">No todos yet.</li>
          ) : (
            todos.map((todo) => (
              <li className="app-list__item" key={todo.id}>
                {todo.name}
              </li>
            ))
          )}
        </ul>

        <div className={onOpenApp ? "app-actions app-actions--inline" : "app-actions"}>
          <button type="button" onClick={() => void loadTodos()} className="btn-secondary">
            Reload
          </button>
          {onOpenApp ? (
            <button type="button" onClick={onOpenApp} className="btn-primary">
              Open app
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
