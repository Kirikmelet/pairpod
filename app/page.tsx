"use client";
import { useChatroom } from "./hook";
import { useEffect } from "react";

export default function Page() {
  const { room, loading, error, ensureRoom, refresh } = useChatroom(
    crypto.randomUUID(),
  );
  if (error) return <p>Error! `${error}`</p>;
  useEffect(() => {
    refresh().then((status) => console.debug(`Refresh ${status}`));
  });
  if (!room) {
    ensureRoom().then((status) => {
      console.debug(`Ensured room ${status}`);
    });
  }
  return <div>67</div>;
}
