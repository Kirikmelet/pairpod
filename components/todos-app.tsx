"use client";

type TodosAppProps = {
  variant?: "page" | "popup";
  onOpenApp?: () => void;
};

export function TodosApp({ variant = "page", onOpenApp }: TodosAppProps) {
  const isPopup = variant === "popup";
  const status = "The old todos demo has been disabled.";

  return (
    <section className="app-panel">
      <div className="app-panel__body">
        <header className="app-header">
          <span className="app-eyebrow">Live pod</span>
          <h1 className={`app-title ${isPopup ? "app-title--sm" : ""}`}>
            Uncommon Hacks
          </h1>
          <p className="status-note">{status}</p>
        </header>

        <ul className="app-list">
          <li className="app-list__item app-list__item--empty">
            Connect this panel to the new backend API routes.
          </li>
        </ul>

        <div className={onOpenApp ? "app-actions app-actions--inline" : "app-actions"}>
          <button type="button" disabled className="btn-secondary">
            Demo disabled
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
