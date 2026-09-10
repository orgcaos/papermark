import { readFile } from "node:fs/promises";
import path from "node:path";

import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

// Not run on the Edge runtime: the bundled fonts push this route past
// Vercel's 1MB Edge Function size limit on the Hobby plan. It doesn't need
// edge speed (it's a low-traffic, cacheable share-card image), so the
// default Node.js serverless runtime (much higher size limit) is used
// instead — same output, just built differently.
//
// Font loading also had to change to match: fetch(new URL(..., import.meta.url))
// is an Edge-runtime-only trick for reading local files, not real HTTP, and it
// throws "fetch failed" under the plain Node.js runtime. fs.readFile from a
// process.cwd()-relative path is the Node equivalent and returns a Buffer,
// which ImageResponse's fonts option accepts directly.

export async function GET(req: NextRequest) {
  const [inter, interBold] = await Promise.all([
    readFile(path.join(process.cwd(), "styles/Inter-Regular.ttf")),
    readFile(path.join(process.cwd(), "public/_static/Inter-Bold.ttf")),
  ]);

  const year = req.nextUrl.searchParams.get("year") || "2024";
  const minutesSpentOnDocs =
    req.nextUrl.searchParams.get("minutesSpentOnDocs") || "1000";
  const uploadedDocuments =
    req.nextUrl.searchParams.get("uploadedDocuments") || "100";
  const sharedLinks = req.nextUrl.searchParams.get("sharedLinks") || "10";
  const receivedViews = req.nextUrl.searchParams.get("receivedViews") || "1000";

  return new ImageResponse(
    (
      <div
        tw="flex bg-black w-full h-full items-center justify-between"
        style={{ padding: "48px" }}
      >
        {/* Left Side Text */}
        <div tw="flex flex-col text-white" style={{ marginLeft: "48px" }}>
          <div tw="flex text-7xl font-bold mb-4 tracking-tighter">
            Papermark
          </div>
          <div tw="flex text-5xl mb-4">Year in Review</div>
          <div tw="flex text-7xl font-bold">{year}</div>
        </div>

        {/* Ticket Container */}
        <div
          tw="flex flex-col bg-[#fb7a00] rounded-3xl relative overflow-hidden justify-between"
          style={{
            width: "400px",
            height: "480px",
            marginRight: "48px",
            boxShadow: "0 0 100px -15px rgba(251, 122, 0, 0.3)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
          }}
        >
          {/* Header Section */}
          <div tw="flex items-start p-8 items-center">
            <div tw="flex text-2xl font-bold text-white tracking-tighter">
              Papermark
            </div>
          </div>

          {/* Main Content */}
          <div tw="flex flex-col p-8 border-t border-white/20 h-[240px] justify-center">
            <div tw="flex text-7xl font-bold text-white mb-2">
              {minutesSpentOnDocs}
            </div>
            <div tw="flex text-2xl font-normal text-white/80">
              minutes viewed
            </div>
          </div>

          {/* Year */}
          <div tw="flex p-8 text-xl text-white/80 border-t border-white/20 items-center">
            {year}
          </div>

          {/* Footer */}
          <div tw="flex p-8 text-sm text-white/60 border-t border-white/20 items-center">
            YEAR IN REVIEW
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        "Cache-Control": "public, max-age=3600, immutable",
      },
      fonts: [
        {
          name: "Inter",
          data: inter,
          weight: 400,
          style: "normal",
        },
        {
          name: "Inter",
          data: interBold,
          weight: 700,
          style: "normal",
        },
      ],
    },
  );
}
