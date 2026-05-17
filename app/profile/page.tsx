import { Suspense } from "react";
import { ProfileSettingsPage } from "@/components/profile-settings-page";

export default function ProfilePage() {
  return (
    <Suspense fallback={<p className="status-note">Loading profile...</p>}>
      <ProfileSettingsPage />
    </Suspense>
  );
}
