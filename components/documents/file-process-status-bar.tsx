import { useEffect, useState } from "react";

import useSWR from "swr";

import { Progress } from "@/components/ui/progress";

import { cn, fetcher } from "@/lib/utils";

const QUEUED_MESSAGES = [
  "Converting document...",
  "Optimizing for viewing...",
  "Preparing preview...",
  "Almost ready...",
];

type ProcessingStatus = {
  hasPages: boolean;
  numPages: number | null;
  pagesConverted: number | null;
};

const POLL_INTERVAL_MS = 2500;

export default function FileProcessStatusBar({
  documentVersionId,
  className,
  mutateDocument,
  onProcessingChange,
}: {
  documentVersionId: string;
  className?: string;
  mutateDocument: () => void;
  onProcessingChange?: (processing: boolean) => void;
}) {
  const [messageIndex, setMessageIndex] = useState(0);
  const [done, setDone] = useState(false);

  const { data, error } = useSWR<ProcessingStatus>(
    done
      ? null
      : `/api/documents/processing-status?documentVersionId=${documentVersionId}`,
    fetcher,
    { refreshInterval: POLL_INTERVAL_MS, revalidateOnFocus: false },
  );

  useEffect(() => {
    if (onProcessingChange) {
      onProcessingChange(!done && !error);
    }
  }, [done, error, onProcessingChange]);

  useEffect(() => {
    if (data?.hasPages && !done) {
      setDone(true);
      mutateDocument();
    }
  }, [data, done, mutateDocument]);

  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (!done) {
      interval = setInterval(() => {
        setMessageIndex((current) => (current + 1) % QUEUED_MESSAGES.length);
      }, 5000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [done]);

  if (done) {
    return null;
  }

  if (error) {
    return (
      <Progress
        value={0}
        text="Error processing document"
        error={true}
        className={cn(
          "w-full rounded-none text-[8px] font-semibold",
          className,
        )}
      />
    );
  }

  const progress =
    data?.numPages && data.pagesConverted
      ? Math.min(100, (data.pagesConverted / data.numPages) * 100)
      : 0;

  return (
    <Progress
      value={progress}
      text={QUEUED_MESSAGES[messageIndex]}
      className={cn("w-full rounded-none text-[8px] font-semibold", className)}
    />
  );
}
