"use client";

import { useEffect, useRef, useState } from "react";
import {
  getUnopenedDmThreads,
  listDmThreads,
  type DmThreadSummary,
} from "@/lib/client/dms";
import { useCurrentUserProfile } from "@/lib/client/page-api";
import { playSfx } from "@/lib/client/sfx";
import { createClient } from "@/utils/supabase/client";

type DmNotificationBadgeProps = {
  className?: string;
};

export function DmNotificationBadge({ className = "" }: DmNotificationBadgeProps) {
  const { profile } = useCurrentUserProfile();
  const [threads, setThreads] = useState<DmThreadSummary[]>([]);
  const notifiedMessageIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    let isMounted = true;

    async function loadThreads() {
      try {
        const nextThreads = await listDmThreads();
        if (isMounted) {
          setThreads(nextThreads);
        }
      } catch {
        if (isMounted) {
          setThreads([]);
        }
      }
    }

    void loadThreads();

    const supabase = createClient();
    const channel = supabase
      .channel("dm-notification-badge")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dm_messages" },
        () => void loadThreads(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dm_thread_members" },
        () => void loadThreads(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dm_thread_reads" },
        () => void loadThreads(),
      )
      .subscribe();
    const interval = window.setInterval(() => void loadThreads(), 8000);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, []);

  const unopened = getUnopenedDmThreads(threads, profile?.id);
  const count = unopened.length;

  useEffect(() => {
    const newestMessage = unopened
      .map((thread) => thread.latestMessage)
      .filter((message): message is NonNullable<typeof message> => Boolean(message))
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )[0];

    if (!newestMessage || notifiedMessageIds.current.has(newestMessage.id)) {
      return;
    }

    notifiedMessageIds.current.add(newestMessage.id);
    void playSfx("mail");
  }, [unopened]);

  if (count === 0) {
    return null;
  }

  return (
    <span className={`dm-notification-badge ${className}`} aria-label={`${count} unopened DMs`}>
      {count > 9 ? "9+" : count}
    </span>
  );
}
