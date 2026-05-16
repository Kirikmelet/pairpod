import { Suspense } from "react";
import { ChatPage } from "@/components/chat-page";

export default function Page() {
  return (
    <Suspense fallback={<p className="status-note">Loading chat...</p>}>
      <ChatPage />
    </Suspense>
  );
}
