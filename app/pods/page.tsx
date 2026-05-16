import { Suspense } from "react";
import { PodSelectionPage } from "@/components/pod-selection-page";

export default function PodsPage() {
  return (
    <Suspense fallback={<p className="status-note">Loading pods...</p>}>
      <PodSelectionPage />
    </Suspense>
  );
}
