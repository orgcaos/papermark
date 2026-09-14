import { Tinybird } from "@chronark/zod-bird";
import { z } from "zod";

import { VIDEO_EVENT_TYPES } from "../constants";
import { WEBHOOK_TRIGGERS } from "../webhook/constants";

const tb = new Tinybird({
  token: process.env.TINYBIRD_TOKEN!,
  // Tinybird is region-hosted; zod-bird defaults to the US API host.
  baseUrl: process.env.TINYBIRD_BASE_URL,
});

// A parameter declared here is only a client-side contract: Tinybird silently
// ignores query params the deployed pipe's SQL doesn't reference. So adding
// `until` below is a no-op until the matching endpoints/*.pipe is pushed
// (`tb push --force`). Keep the two in lockstep — an `until` that exists here
// but not in the SQL reads as a working time filter while returning all-time
// numbers.
export const getTotalAvgPageDuration = tb.buildPipe({
  pipe: "get_total_average_page_duration",
  parameters: z.object({
    documentId: z.string(),
    excludedLinkIds: z.string().describe("Comma separated linkIds"),
    excludedViewIds: z.string().describe("Comma separated viewIds"),
    since: z.number(),
    until: z.number().optional(),
  }),
  data: z.object({
    versionNumber: z.number().int(),
    pageNumber: z.string(),
    avg_duration: z.number(),
  }),
});

export const getViewPageDuration = tb.buildPipe({
  pipe: "get_page_duration_per_view",
  parameters: z.object({
    documentId: z.string(),
    viewId: z.string(),
    since: z.number(),
    until: z.number().optional(),
  }),
  data: z.object({
    pageNumber: z.string(),
    sum_duration: z.number(),
  }),
});

export const getViewCompletionStats = tb.buildPipe({
  pipe: "get_view_completion_stats",
  parameters: z.object({
    documentId: z.string(),
    excludedViewIds: z.string().describe("Comma separated viewIds"),
    since: z.number(),
  }),
  data: z.object({
    viewId: z.string(),
    versionNumber: z.number().int(),
    pages_viewed: z.number(),
  }),
});

export const getTotalDocumentDuration = tb.buildPipe({
  pipe: "get_total_document_duration",
  parameters: z.object({
    documentId: z.string(),
    excludedLinkIds: z.string().describe("Comma separated linkIds"),
    excludedViewIds: z.string().describe("Comma separated viewIds"),
    since: z.number(),
    until: z.number().optional(),
  }),
  data: z.object({
    sum_duration: z.number(),
  }),
});

export const getTotalLinkDuration = tb.buildPipe({
  pipe: "get_total_link_duration",
  parameters: z.object({
    linkId: z.string(),
    documentId: z.string(),
    excludedViewIds: z.string().describe("Comma separated viewIds"),
    since: z.number(),
    until: z.number().optional(),
  }),
  data: z.object({
    sum_duration: z.number(),
    view_count: z.number(),
  }),
});

export const getTotalViewerDuration = tb.buildPipe({
  pipe: "get_total_viewer_duration",
  parameters: z.object({
    viewIds: z.string().describe("Comma separated viewIds"),
    since: z.number(),
    until: z.number().optional(),
  }),
  data: z.object({
    sum_duration: z.number(),
  }),
});

// Batched variants of the four pipes above, used by the team-wide dashboard
// tabs (Links/Documents/Visitors/Views) and the per-document views list,
// which otherwise fired one Tinybird query per row -- easily burning through
// the daily query quota on a page with more than a handful of rows. Each of
// these takes a comma-separated list of IDs and returns one row per ID
// (or, for get_page_durations_batch, one row per viewId+pageNumber) via a
// single GROUP BY query instead of N separate calls.
export const getLinkDurationsBatch = tb.buildPipe({
  pipe: "get_link_durations_batch",
  parameters: z.object({
    linkIds: z.string().describe("Comma separated linkIds"),
    since: z.number(),
  }),
  data: z.object({
    linkId: z.string(),
    sum_duration: z.number(),
    view_count: z.number(),
  }),
});

export const getDocumentDurationsBatch = tb.buildPipe({
  pipe: "get_document_durations_batch",
  parameters: z.object({
    documentIds: z.string().describe("Comma separated documentIds"),
    since: z.number(),
  }),
  data: z.object({
    documentId: z.string(),
    sum_duration: z.number(),
  }),
});

export const getViewDurationsBatch = tb.buildPipe({
  pipe: "get_view_durations_batch",
  parameters: z.object({
    viewIds: z.string().describe("Comma separated viewIds"),
    since: z.number(),
  }),
  data: z.object({
    viewId: z.string(),
    sum_duration: z.number(),
  }),
});

export const getPageDurationsBatch = tb.buildPipe({
  pipe: "get_page_durations_batch",
  parameters: z.object({
    viewIds: z.string().describe("Comma separated viewIds"),
    since: z.number(),
  }),
  data: z.object({
    viewId: z.string(),
    // Tinybird returns this as a string, same as every other pipe here
    // (get_total_average_page_duration, get_page_duration_per_view) --
    // z.number() here was wrong and made every row fail validation,
    // silently defeating this pipe's whole reason for existing (see the
    // fallback comment at its call site in views/index.ts).
    pageNumber: z.string(),
    sum_duration: z.number(),
  }),
});

export const getViewUserAgent_v2 = tb.buildPipe({
  pipe: "get_useragent_per_view",
  parameters: z.object({
    documentId: z.string(),
    viewId: z.string(),
    since: z.number(),
  }),
  data: z.object({
    country: z.string(),
    city: z.string(),
    browser: z.string(),
    os: z.string(),
    device: z.string(),
  }),
});

export const getViewUserAgent = tb.buildPipe({
  pipe: "get_useragent_per_view",
  parameters: z.object({
    viewId: z.string(),
  }),
  data: z.object({
    country: z.string(),
    city: z.string(),
    browser: z.string(),
    os: z.string(),
    device: z.string(),
  }),
});

export const getTotalDataroomDuration = tb.buildPipe({
  pipe: "get_total_dataroom_duration",
  parameters: z.object({
    dataroomId: z.string(),
    excludedLinkIds: z.array(z.string()),
    excludedViewIds: z.array(z.string()),
    since: z.number(),
    until: z.number().optional(),
  }),
  data: z.object({
    viewId: z.string(),
    sum_duration: z.number(),
  }),
});

export const getDocumentDurationPerViewer = tb.buildPipe({
  pipe: "get_document_duration_per_viewer",
  parameters: z.object({
    documentId: z.string(),
    viewIds: z.string().describe("Comma separated viewIds"),
  }),
  data: z.object({
    sum_duration: z.number(),
  }),
});

export const getWebhookEvents = tb.buildPipe({
  pipe: "get_webhook_events",
  parameters: z.object({
    webhookId: z.string(),
  }),
  data: z.object({
    event_id: z.string(),
    webhook_id: z.string(),
    message_id: z.string(), // QStash message ID
    event: z.enum(WEBHOOK_TRIGGERS),
    url: z.string(),
    http_status: z.number(),
    request_body: z.string(),
    response_body: z.string(),
    timestamp: z.string(),
  }),
});

export const getVideoEventsByDocument = tb.buildPipe({
  pipe: "get_video_events_by_document",
  parameters: z.object({
    document_id: z.string(),
  }),
  data: z.object({
    timestamp: z.string(),
    view_id: z.string(),
    event_type: z.enum(VIDEO_EVENT_TYPES),
    start_time: z.number(),
    end_time: z.number(),
    playback_rate: z.number(),
    volume: z.number(),
    is_muted: z.number(),
    is_focused: z.number(),
    is_fullscreen: z.number(),
  }),
});

export const getVideoEventsByView = tb.buildPipe({
  pipe: "get_video_events_by_view",
  parameters: z.object({
    document_id: z.string(),
    view_id: z.string(),
  }),
  data: z.object({
    timestamp: z.string(),
    event_type: z.string(),
    start_time: z.number(),
    end_time: z.number(),
  }),
});

export const getClickEventsByView = tb.buildPipe({
  pipe: "get_click_events_by_view",
  parameters: z.object({
    document_id: z.string(),
    view_id: z.string(),
  }),
  data: z.object({
    timestamp: z.string(),
    document_id: z.string(),
    dataroom_id: z.string().nullable(),
    view_id: z.string(),
    page_number: z.string(),
    version_number: z.number(),
    href: z.string(),
  }),
});

export const getDataroomViewDocumentStats = tb.buildPipe({
  pipe: "get_dataroom_view_document_stats",
  parameters: z.object({
    viewIds: z.string().describe("Comma separated viewIds"),
  }),
  data: z.object({
    viewId: z.string(),
    documentId: z.string(),
    sum_duration: z.number(),
    pages_viewed: z.number(),
  }),
});

export const getTotalTeamDuration = tb.buildPipe({
  pipe: "get_total_team_duration",
  parameters: z.object({
    documentIds: z.string().describe("Comma separated documentIds"),
    since: z.number(),
    until: z.number(),
  }),
  data: z.object({
    total_duration: z.number(),
    unique_countries: z.array(z.string()),
  }),
});
