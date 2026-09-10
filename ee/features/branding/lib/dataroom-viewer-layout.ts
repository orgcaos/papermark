import { z } from "zod";

// Dataroom viewer layout customization is out of scope for this deployment
// (only single-document sharing is supported); these types/schemas exist
// only so the branding/dataroom pages that reference them still compile.
// Values below match what the (out-of-scope) branding UI already uses.

export type DataroomCardLayout = "LIST" | "GRID" | "COMPACT";
export type DataroomViewerHeaderStyle = "DEFAULT" | "SPLIT" | "NOTION";
export type DataroomLayoutCardId = "STANDARD" | "STRICT" | "MODERN" | "NOTION";
export type DataroomViewerLayoutPreset = DataroomLayoutCardId | "CUSTOM";

export const DataroomCardLayoutSchema = z.enum(["LIST", "GRID", "COMPACT"]);
export const DataroomViewerHeaderStyleSchema = z.enum([
  "DEFAULT",
  "SPLIT",
  "NOTION",
]);
export const DataroomViewerLayoutPresetSchema = z.enum([
  "STANDARD",
  "STRICT",
  "MODERN",
  "NOTION",
  "CUSTOM",
]);

export function asDataroomCardLayout(value: unknown): DataroomCardLayout {
  return value === "GRID" || value === "COMPACT" ? value : "LIST";
}

export function asDataroomViewerHeaderStyle(
  value: unknown,
): DataroomViewerHeaderStyle {
  return value === "SPLIT" || value === "NOTION" ? value : "DEFAULT";
}

export function inferDataroomViewerLayoutPreset(settings: {
  cardLayout: DataroomCardLayout;
  showFolderTree: boolean;
  hideFolderIconsInMain: boolean;
  viewerHeaderStyle: DataroomViewerHeaderStyle;
}): DataroomViewerLayoutPreset {
  const { cardLayout, showFolderTree, hideFolderIconsInMain, viewerHeaderStyle } =
    settings;

  if (
    cardLayout === "LIST" &&
    showFolderTree &&
    !hideFolderIconsInMain &&
    viewerHeaderStyle === "DEFAULT"
  ) {
    return "STANDARD";
  }
  if (
    cardLayout === "COMPACT" &&
    !showFolderTree &&
    hideFolderIconsInMain &&
    viewerHeaderStyle === "DEFAULT"
  ) {
    return "STRICT";
  }
  if (
    cardLayout === "COMPACT" &&
    !showFolderTree &&
    hideFolderIconsInMain &&
    viewerHeaderStyle === "SPLIT"
  ) {
    return "MODERN";
  }
  if (
    cardLayout === "GRID" &&
    !showFolderTree &&
    !hideFolderIconsInMain &&
    viewerHeaderStyle === "NOTION"
  ) {
    return "NOTION";
  }
  return "CUSTOM";
}

export const CARD_LAYOUT_OPTIONS: {
  value: DataroomCardLayout;
  label: string;
}[] = [
  { value: "LIST", label: "List" },
  { value: "GRID", label: "Grid" },
  { value: "COMPACT", label: "Compact" },
];
