import { Suspense } from "react";
import { HomePage } from "@/components/home-page";

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-full items-center justify-center text-sm text-zinc-500">
          Loading…
        </div>
      }
    >
      <HomePage variant="page" />
    </Suspense>
  );
}
