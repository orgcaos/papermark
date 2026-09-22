import { useCallback, useEffect, useRef, useState } from "react";

import type { PageLink } from "@/lib/types/page-link";

type PageData = {
  file: string | null;
  pageNumber: string;
  embeddedLinks: string[];
  pageLinks?: PageLink[] | null;
  metadata: { width: number; height: number; scaleFactor: number } | null;
};

type FetchPagesResponse = {
  pages: {
    pageNumber: number;
    file: string;
    /**
     * Re-signed overlay URLs for `pageLinks` of the requested page.
     * Optional so older callers stay compatible.
     */
    pageLinks?: PageLink[];
  }[];
};

type UseLazyPagesOptions = {
  initialPages: PageData[];
  viewId?: string;
  previewToken?: string;
  linkId?: string;
  documentVersionId: string;
  preloadRadius?: number;
  apiEndpoint?: string;
};

const DEFAULT_PRELOAD_RADIUS = 5;

export function useLazyPages({
  initialPages,
  viewId,
  previewToken,
  linkId,
  documentVersionId,
  preloadRadius = DEFAULT_PRELOAD_RADIUS,
  apiEndpoint = "/api/views/pages",
}: UseLazyPagesOptions) {
  const [pages, setPages] = useState<PageData[]>(initialPages);
  const pagesRef = useRef<PageData[]>(pages);
  const pendingRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  useEffect(() => {
    setPages(initialPages);
    pagesRef.current = initialPages;
  }, [initialPages]);

  const fetchPageUrls = useCallback(
    async (pageNumbers: number[], { force = false } = {}) => {
      const currentPages = pagesRef.current;
      const needed = pageNumbers.filter(
        (pn) =>
          pn >= 1 &&
          pn <= currentPages.length &&
          (force || !currentPages[pn - 1]?.file) &&
          !pendingRef.current.has(pn),
      );

      if (needed.length === 0) return;

      needed.forEach((pn) => pendingRef.current.add(pn));

      try {
        const payload =
          viewId
            ? { viewId, documentVersionId, pageNumbers: needed }
            : { previewToken, linkId, documentVersionId, pageNumbers: needed };

        const response = await fetch(apiEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          needed.forEach((pn) => pendingRef.current.delete(pn));
          return;
        }

        const data: FetchPagesResponse = await response.json();

        setPages((prev) => {
          const updated = [...prev];
          for (const fetchedPage of data.pages) {
            const idx = fetchedPage.pageNumber - 1;
            if (idx >= 0 && idx < updated.length && updated[idx]) {
              updated[idx] = {
                ...updated[idx],
                file: fetchedPage.file,
                ...(fetchedPage.pageLinks
                  ? { pageLinks: fetchedPage.pageLinks }
                  : {}),
              };
            }
          }
          return updated;
        });

        needed.forEach((pn) => pendingRef.current.delete(pn));
      } catch {
        needed.forEach((pn) => pendingRef.current.delete(pn));
      }
    },
    [viewId, previewToken, linkId, documentVersionId, apiEndpoint],
  );

  // Called by the viewers from a page <img>'s onError. The usual cause is an
  // expired signed URL (the reader took longer to reach this page than the
  // URL's lifetime) -- re-sign it and let the <img> retry with the new src.
  // Capped per page so a page that is genuinely missing from storage doesn't
  // loop; after that the browser's broken-image state stands.
  const refreshAttemptsRef = useRef<Map<number, number>>(new Map());
  const MAX_REFRESHES_PER_PAGE = 2;
  const refreshPageUrl = useCallback(
    (pageNumber: number) => {
      const attempts = refreshAttemptsRef.current.get(pageNumber) ?? 0;
      if (attempts >= MAX_REFRESHES_PER_PAGE) return;
      refreshAttemptsRef.current.set(pageNumber, attempts + 1);
      fetchPageUrls([pageNumber], { force: true });
    },
    [fetchPageUrls],
  );

  const ensurePagesLoaded = useCallback(
    (currentPage: number) => {
      const currentPages = pagesRef.current;
      const start = Math.max(1, currentPage - preloadRadius);
      const end = Math.min(currentPages.length, currentPage + preloadRadius);
      const needed: number[] = [];

      for (let i = start; i <= end; i++) {
        if (!currentPages[i - 1]?.file && !pendingRef.current.has(i)) {
          needed.push(i);
        }
      }

      if (needed.length > 0) {
        fetchPageUrls(needed);
      }
    },
    [preloadRadius, fetchPageUrls],
  );

  return { pages, ensurePagesLoaded, fetchPageUrls, refreshPageUrl };
}
