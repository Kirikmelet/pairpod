import { Suspense } from "react";
import { PeerNetworkPage } from "@/components/peer-network-page";

export default function Page() {
  return (
    <Suspense fallback={<p className="status-note">Loading peer map...</p>}>
      <PeerNetworkPage />
    </Suspense>
  );
}
