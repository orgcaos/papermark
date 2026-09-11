"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * The "3 / 12" page-count chip in the viewer nav bar - click it to type a
 * page number and jump straight there. An out-of-range or non-numeric entry
 * is shown as invalid (red) instead of jumping anywhere; Escape or clicking
 * away cancels back to the current page.
 */
export function PageJumpControl({
  pageNumber,
  numPages,
  onGoToPage,
}: {
  pageNumber: number;
  numPages: number;
  onGoToPage: (page: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(pageNumber));
  const [invalid, setInvalid] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep the displayed value in sync with the real page number whenever
  // we're not actively editing (e.g. navigating via arrows/keyboard/scroll).
  useEffect(() => {
    if (!editing) {
      setValue(String(pageNumber));
      setInvalid(false);
    }
  }, [pageNumber, editing]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = () => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > numPages) {
      setInvalid(true);
      return;
    }
    setEditing(false);
    setInvalid(false);
    if (parsed !== pageNumber) onGoToPage(parsed);
  };

  const cancel = () => {
    setEditing(false);
    setValue(String(pageNumber));
    setInvalid(false);
  };

  if (editing) {
    return (
      <div
        className={cn(
          "flex h-8 items-center space-x-1 rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white sm:h-10 sm:px-4 sm:py-2 sm:text-sm",
          invalid && "ring-2 ring-red-500",
        )}
      >
        <input
          ref={inputRef}
          type="number"
          inputMode="numeric"
          min={1}
          max={numPages}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setInvalid(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
          }}
          onBlur={cancel}
          className={cn(
            "w-8 border-none bg-transparent text-center outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
            invalid ? "text-red-400" : "text-white",
          )}
          style={{ fontVariantNumeric: "tabular-nums" }}
        />
        <span className="text-gray-400">/</span>
        <span
          className="text-gray-400"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {numPages}
        </span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title="Click to jump to a page"
      className="flex h-8 items-center space-x-1 rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gray-900/80 sm:h-10 sm:px-4 sm:py-2 sm:text-sm"
    >
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{pageNumber}</span>
      <span className="text-gray-400">/</span>
      <span
        className="text-gray-400"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {numPages}
      </span>
    </button>
  );
}
