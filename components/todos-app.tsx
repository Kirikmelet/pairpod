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
  const [status, setStatus] = useState("Loading todos…");
  const [isError, setIsError] = useState(false);

  const loadTodos = useCallback(async () => {
    setStatus("Loading todos…");
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
    <div
      className={
        isPopup
          ? "flex w-[320px] flex-col gap-4 bg-background p-4 text-foreground"
          : "flex min-h-full flex-col items-center justify-center bg-zinc-50 px-6 py-16 font-sans dark:bg-black"
      }
    >
      <div
        className={
          isPopup
            ? "flex w-full flex-col gap-3"
            : "flex w-full max-w-lg flex-col gap-6 rounded-3xl bg-white p-8 shadow-sm dark:bg-zinc-950"
        }
      >
        <header className="flex flex-col gap-1">
          <h1
            className={
              isPopup
                ? "text-base font-semibold"
                : "text-3xl font-semibold tracking-tight text-black dark:text-zinc-50"
            }
          >
            Uncommon Hacks
          </h1>
          <p
            className={`text-sm ${isError ? "text-red-600 dark:text-red-400" : "text-zinc-500 dark:text-zinc-400"}`}
          >
            {status}
          </p>
        </header>

        <ul className="max-h-56 list-disc space-y-2 overflow-auto pl-5 text-sm">
          {todos.length === 0 ? (
            <li className="list-none pl-0 text-zinc-500 dark:text-zinc-400">
              No todos yet.
            </li>
          ) : (
            todos.map((todo) => <li key={todo.id}>{todo.name}</li>)
          )}
        </ul>

        <div className="grid gap-2">
          <button
            type="button"
            onClick={() => void loadTodos()}
            className="rounded-full border border-zinc-200 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-900"
          >
            Reload
          </button>
          {onOpenApp ? (
            <button
              type="button"
              onClick={onOpenApp}
              className="rounded-full bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition-colors hover:opacity-90"
            >
              Open app
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
