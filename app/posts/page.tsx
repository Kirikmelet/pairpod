import { Suspense } from "react";
import { PostStreamPage } from "@/components/post-stream-page";

export default function Page() {
  return (
    <Suspense fallback={<p className="status-note">Loading posts...</p>}>
      <PostStreamPage />
    </Suspense>
  );
}
