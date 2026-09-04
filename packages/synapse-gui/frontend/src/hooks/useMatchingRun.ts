import { useQuery } from "@tanstack/react-query";
import { getMatchingJobStatus, getMatchingJobResult } from "../api/client";
import type { MatchingJobStatusResponse, MatchingResultResponse } from "../types/api";

export function useMatchingRun(jobId: string | null) {
  const statusQuery = useQuery<MatchingJobStatusResponse>({
    queryKey: ["matching-job-status", jobId],
    queryFn: ({ signal }) => getMatchingJobStatus(jobId!, signal),
    enabled: Boolean(jobId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "completed" || status === "failed" ? false : 1000;
    },
  });

  const status = statusQuery.data?.status;
  const isFinished = status === "completed";

  const resultQuery = useQuery<MatchingResultResponse>({
    queryKey: ["matching-job-result", jobId],
    queryFn: ({ signal }) => getMatchingJobResult(jobId!, signal),
    enabled: Boolean(jobId) && isFinished,
  });

  return {
    statusQuery,
    resultQuery,
    isFinished,
  };
}