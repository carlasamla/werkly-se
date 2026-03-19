"use client"

import { useSession, signOut } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { IconLogout } from "@tabler/icons-react"

export function NavHeader() {
  const { data: session } = useSession()

  if (!session) return null

  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold">Werkly</span>
          <span className="text-sm text-muted-foreground">
            {session.user.name}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => signOut()}
          className="gap-2 text-muted-foreground"
        >
          <IconLogout className="h-4 w-4" />
          Logga ut
        </Button>
      </div>
    </header>
  )
}
