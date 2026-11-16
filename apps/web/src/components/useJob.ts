"use client";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";

/** Suit un job de génération jusqu'à sa fin puis rafraîchit le plan. */
export function useJob() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useQuery({ ...trpc.plan.job.queryOptions({ jobId: jobId ?? "00000000-0000-0000-0000-000000000000" }), enabled: !!jobId, refetchInterval: 1000 });
  const done = job.data && (job.data.status === "succeeded" || job.data.status === "failed");
  useEffect(() => {
    if (done) {
      void qc.invalidateQueries({ queryKey: trpc.plan.current.queryKey() });
      setJobId(null);
    }
  }, [done, qc, trpc]);
  return { running: !!jobId, start: setJobId };
}
