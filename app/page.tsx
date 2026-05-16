import { Suspense } from "react";
import { HomePage } from "@/components/home-page";

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="app-scene">
          <div className="app-scene__content">
            <p className="status-note">Loading...</p>
          </div>
        </div>
      }
    >
      <HomePage variant="page" />
    </Suspense>
  );
}
