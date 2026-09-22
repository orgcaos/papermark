import { NextApiRequest, NextApiResponse } from "next";

import { presignGetUrl } from "@/lib/files/presign-get-url";
import { log } from "@/lib/utils";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).end("Method Not Allowed");
  }

  // Extract the API Key from the Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const token = authHeader.split(" ")[1]; // Assuming the format is "Bearer [token]"

  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  // Check if the API Key matches
  if (!process.env.INTERNAL_API_KEY) {
    log({
      message: "INTERNAL_API_KEY environment variable is not set",
      type: "error",
    });
    return res.status(500).json({ message: "Server configuration error" });
  }
  if (token !== process.env.INTERNAL_API_KEY) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const {
    key,
    expiresIn: requestedExpiresIn,
    responseContentDisposition,
  } = req.body as {
    key: string;
    expiresIn?: number;
    responseContentDisposition?: string;
  };

  try {
    // Shared in-process signer (lib/files/presign-get-url.ts). The document
    // view routes sign directly via lib/files/get-file-server.ts now; this
    // endpoint remains for the client-side proxy and remaining callers.
    const url = await presignGetUrl({
      key,
      expiresIn: requestedExpiresIn,
      responseContentDisposition,
    });

    return res.status(200).json({ url });
  } catch (error) {
    log({
      message: `Error getting presigned get url for ${key} \n\n ${error}`,
      type: "error",
    });
    return res
      .status(500)
      .json({ error: "AWS Cloudfront Signed URL Error", message: error });
  }
}
