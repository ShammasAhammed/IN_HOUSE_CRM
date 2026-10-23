// Which version of Oppllo One is live (test report H4): open tabs compare it with the version they were loaded from,
// and offer a reload before the next save fails.
import { connection } from "next/server";

export async function GET() {
  await connection();
  return Response.json({ version: process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || "dev" }, { headers: { "Cache-Control": "no-store" } });
}
