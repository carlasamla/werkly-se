import { betterAuth } from "better-auth"
import { genericOAuth } from "better-auth/plugins"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { db } from "@/lib/db"
import * as schema from "@/lib/db/schema"
import * as authSchema from "@/lib/db/auth-schema"

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { ...authSchema, ...schema },
  }),

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh daily
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 min cache
    },
  },

  plugins: [
    genericOAuth({
      config: [
        {
          providerId: "fortnox",
          clientId: process.env.FORTNOX_CLIENT_ID!,
          clientSecret: process.env.FORTNOX_CLIENT_SECRET!,
          authorizationUrl: "https://apps.fortnox.se/oauth-v1/auth",
          tokenUrl: "https://apps.fortnox.se/oauth-v1/token",
          // Scopes must match what's registered in Fortnox developer portal.
          // Add more scopes as they get approved in the Fortnox integration settings.
          scopes: (process.env.FORTNOX_SCOPES ?? "companyinformation").split(
            " "
          ),
          accessType: "offline",
          authentication: "basic" as const,
          getUserInfo: async (tokens) => {
            const res = await fetch(
              "https://api.fortnox.se/3/companyinformation",
              {
                headers: {
                  Authorization: `Bearer ${tokens.accessToken}`,
                  Accept: "application/json",
                },
              }
            )
            if (!res.ok) {
              throw new Error(
                `Failed to fetch Fortnox company info: ${res.status}`
              )
            }
            const data = await res.json()
            const info = data.CompanyInformation
            return {
              id: info.OrganizationNumber || info.CompanyName,
              name: info.CompanyName,
              email: info.Email || `${(info.OrganizationNumber || "unknown").replace(/\s/g, "")}@fortnox.werkly.se`,
              emailVerified: true,
            }
          },
        },
      ],
    }),
  ],
})

export type Session = typeof auth.$Infer.Session
