"use client";

type TodosAppProps = {
  variant?: "page" | "popup";
  onOpenApp?: () => void;
};

export function TodosApp({ variant = "page", onOpenApp }: TodosAppProps) {
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
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            The old todos demo has been disabled.
          </p>
        </header>

        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          This placeholder keeps the app buildable while the frontend is
          migrated to the new backend API routes.
        </p>

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
  );
}
