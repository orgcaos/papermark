import { NextApiRequest, NextApiResponse } from "next";

// Dataroom Q&A / conversations is out of scope for this deployment, so this
// background-job endpoint has nothing to do.

export default async function handler(
  _req: NextApiRequest,
  res: NextApiResponse,
): Promise<void> {
  res.status(200).json({ ok: true });
}
