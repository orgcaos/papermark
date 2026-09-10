import { NextApiRequest, NextApiResponse } from "next";

// Dataroom Q&A / conversations is out of scope for this deployment.

export async function handleRoute(
  _req: NextApiRequest,
  res: NextApiResponse,
): Promise<void> {
  res.status(404).json({ error: "Not found" });
}
