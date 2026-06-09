"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import {
  getAllProgress,
  getAllResponses,
  getDailySessions,
  getDayState,
  getProfile,
  getTestHistory,
} from "@/lib/queries";

export function useSupabase() {
  return useMemo(() => createClient(), []);
}

export function useProfile() {
  const sb = useSupabase();
  return useQuery({ queryKey: ["profile"], queryFn: () => getProfile(sb) });
}

// Current signed-in user + a display name (metadata name, else email prefix).
export function useUser() {
  const sb = useSupabase();
  return useQuery({
    queryKey: ["user"],
    queryFn: async () => {
      const { data } = await sb.auth.getUser();
      const user = data.user;
      if (!user) return null;
      const meta = user.user_metadata ?? {};
      const raw = (meta.full_name || meta.name || user.email?.split("@")[0] || "there") as string;
      const name = raw
        .replace(/[._-]+/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .trim();
      return { id: user.id, email: user.email ?? "", name };
    },
  });
}

export function useTestHistory() {
  const sb = useSupabase();
  return useQuery({ queryKey: ["testHistory"], queryFn: () => getTestHistory(sb) });
}

export function useProgress() {
  const sb = useSupabase();
  return useQuery({ queryKey: ["progress"], queryFn: () => getAllProgress(sb) });
}

export function useResponses() {
  const sb = useSupabase();
  return useQuery({ queryKey: ["responses"], queryFn: () => getAllResponses(sb) });
}

export function useDailySessions() {
  const sb = useSupabase();
  return useQuery({ queryKey: ["dailySessions"], queryFn: () => getDailySessions(sb) });
}

export function useDayState() {
  const sb = useSupabase();
  return useQuery({ queryKey: ["dayState"], queryFn: () => getDayState(sb) });
}
