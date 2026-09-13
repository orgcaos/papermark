import { NextRequest, userAgent } from "next/server";

import { geolocation, ipAddress } from "@vercel/functions";

import { recordLinkViewTB } from "@/lib/tinybird";
import { isBot } from "@/lib/utils/user-agent";

import sendNotification from "../api/notification-helper";
import { sendLinkViewWebhook } from "../api/views/send-webhook-event";
import { EU_COUNTRY_CODES } from "../constants";
import { capitalize, getDomainWithoutWWW } from "../utils";
import { lookupGeoFromIp } from "../utils/geo";
import { getIpAddressFromHeaderGetter } from "../utils/ip";

export async function recordLinkView({
  req,
  clickId,
  viewId,
  linkId,
  teamId,
  documentId,
  dataroomId,
  enableNotification,
  isPaused,
}: {
  req: NextRequest;
  clickId: string;
  viewId: string;
  linkId: string;
  teamId: string;
  documentId?: string;
  dataroomId?: string;
  enableNotification: boolean | null;
  isPaused: boolean;
}) {
  const ua = userAgent(req);
  const bot = isBot(ua.ua);

  // don't track clicks from bots
  if (bot) {
    return null;
  }

  const ip =
    process.env.VERCEL === "1"
      ? ipAddress(req)
      : getIpAddressFromHeaderGetter((name) => req.headers.get(name));

  // get continent, region & geolocation data
  // interesting, geolocation().region is Vercel's edge region – NOT the actual region
  // so we use the x-vercel-ip-country-region or geolocation().countryRegion to get the actual region
  //
  // Off Vercel (self-hosted), there's no edge geolocation available, so look
  // the visitor's real location up from their IP instead -- see
  // lookupGeoFromIp's comment in lib/utils/geo.ts.
  const selfHostedGeo =
    process.env.VERCEL === "1"
      ? null
      : await lookupGeoFromIp(typeof ip === "string" ? ip : "");

  const geo = process.env.VERCEL === "1" ? geolocation(req) : selfHostedGeo!;

  const continent =
    process.env.VERCEL === "1"
      ? req.headers.get("x-vercel-ip-continent")
      : (selfHostedGeo!.continent ?? null);
  const region =
    process.env.VERCEL === "1"
      ? geolocation(req).countryRegion
      : selfHostedGeo!.region;

  const isEuCountry = geo.country && EU_COUNTRY_CODES.includes(geo.country);

  const referer = req.headers.get("referer");
  const refererDomain = referer ? getDomainWithoutWWW(referer) : "(direct)";

  const clickData = {
    timestamp: new Date(Date.now()).toISOString(),
    click_id: clickId,
    view_id: viewId,
    link_id: linkId,
    document_id: documentId || null,
    dataroom_id: dataroomId || null,
    continent: continent || "",
    country: geo.country || "Unknown",
    region: region || "Unknown",
    city: geo.city || "Unknown",
    latitude: geo.latitude || "Unknown",
    longitude: geo.longitude || "Unknown",
    device: ua.device.type ? capitalize(ua.device.type) : "Desktop",
    device_vendor: ua.device.vendor || "Unknown",
    device_model: ua.device.model || "Unknown",
    browser: ua.browser.name || "Unknown",
    browser_version: ua.browser.version || "Unknown",
    engine: ua.engine.name || "Unknown",
    engine_version: ua.engine.version || "Unknown",
    os: ua.os.name || "Unknown",
    os_version: ua.os.version || "Unknown",
    cpu_architecture: ua.cpu?.architecture || "Unknown",
    ua: ua.ua || "Unknown",
    bot: ua.isBot,
    referer: refererDomain,
    referer_url: referer || "(direct)",
    ip_address:
      // only record IP if it's a valid IP and not from a EU country
      typeof ip === "string" && ip.trim().length > 0 && !isEuCountry
        ? ip
        : null,
  };

  const locationData = {
    continent,
    country: geo.country || "Unknown",
    region: region || "Unknown",
    city: geo.city || "Unknown",
  };

  const [, ,] = await Promise.all([
    // record link view in Tinybird
    recordLinkViewTB(clickData),

    // send email notification
    enableNotification ? sendNotification({ viewId, locationData }) : null,

    // send webhook event
    !isPaused
      ? sendLinkViewWebhook({
          teamId,
          clickData,
        })
      : null,
  ]);

  return clickData;
}
