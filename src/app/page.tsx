"use client"

import { useSession, signIn } from "@/lib/auth-client"
import { NavHeader } from "@/components/nav-header"
import { WipApp } from "@/components/wip-app"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { IconBuildingBank, IconLoader2 } from "@tabler/icons-react"

function LandingPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Werkly</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            PUA-rapport — Pågående arbeten
          </p>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          <p className="text-center text-sm text-muted-foreground">
            Anslut ditt Fortnox-konto för att komma igång. Vi hämtar bokföring,
            tid och projektdata för att beräkna pågående arbeten.
          </p>
          <Button
            size="lg"
            className="w-full gap-2"
            onClick={() => signIn.oauth2({ providerId: "fortnox" })}
          >
            <IconBuildingBank className="h-5 w-5" />
            Anslut Fortnox
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

export default function Home() {
  const { data: session, isPending } = useSession()

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <IconLoader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!session) {
    return <LandingPage />
  }

  return (
    <>
      <NavHeader />
      <WipApp />
    </>
  )
}
