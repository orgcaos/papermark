import { useTeam } from "@/context/team-context";
import { View } from "@prisma/client";
import useSWR from "swr";

import { fetcher } from "@/lib/utils";

export interface ViewWithDuration extends View {
  duration: {
    // The API sends pageNumber as a number; older code typed it as a string.
    data: { pageNumber: string | number; sum_duration: number }[];
  };
  totalDuration: number;
  completionRate: number;
  // Pages in the version this visit saw (absent for video documents).
  pagesTotal?: number;
}

interface LinkVisitsResponse {
  views: ViewWithDuration[];
  hiddenFromPause: number;
}

export function useLinkVisits(linkId: string) {
  const teamInfo = useTeam();
  const teamId = teamInfo?.currentTeam?.id;
  const { data, error } = useSWR<LinkVisitsResponse>(
    linkId &&
      teamId &&
      `/api/teams/${teamId}/links/${encodeURIComponent(linkId)}/visits`,
    fetcher,
    {
      dedupingInterval: 10000,
    },
  );

  return {
    views: data?.views,
    hiddenFromPause: data?.hiddenFromPause ?? 0,
    loading: !error && !data,
    error,
  };
}
