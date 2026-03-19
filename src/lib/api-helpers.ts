import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { FortnoxClient } from "@/lib/fortnox"

/** Get the authenticated session or throw */
export async function getSessionOrThrow() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    throw new Error("Unauthorized")
  }
  return session
}

/** Get a FortnoxClient with the current user's access token */
export async function getFortnoxClient(): Promise<FortnoxClient> {
  const session = await getSessionOrThrow()
  const tokenData = await auth.api.getAccessToken({
    body: { providerId: "fortnox" },
    headers: await headers(),
  })

  if (!tokenData?.accessToken) {
    throw new Error("No Fortnox access token found. Please reconnect.")
  }

  return new FortnoxClient(tokenData.accessToken)
}

/** Standard JSON error response */
export function errorResponse(message: string, status = 500) {
  return Response.json({ error: message }, { status })
}
