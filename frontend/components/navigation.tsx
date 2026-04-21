"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { Database, User, GitCommit, Calendar } from "lucide-react"
import { cn } from "@/lib/utils"
import { ThemeToggle } from "@/components/theme-toggle"
import { getUserEmail } from "@/lib/api"
import { BUILD_INFO } from "@/lib/build-info"

export function Navigation() {
  const pathname = usePathname()
  const [userEmail, setUserEmail] = useState("Loading...")

  useEffect(() => {
    const fetchEmail = async () => {
      try {
        const email = await getUserEmail()
        setUserEmail(email)
      } catch (error) {
        console.error("Failed to fetch user email:", error)
        setUserEmail("Error fetching email")
      }
    }
    fetchEmail()
  }, [])

  const navigation = [
    {
      name: "Dashboard",
      href: "/dashboard",
      icon: Database,
      current: pathname === "/dashboard",
    },
  ]

  return (
    <header className="border-b">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/dashboard" className="flex items-center gap-2 font-bold text-xl">
              <Database className="h-6 w-6" />
              pgweb
            </Link>

            <nav className="flex items-center gap-6">
              {navigation.map((item) => {
                const Icon = item.icon
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2 text-sm font-medium transition-colors hover:text-primary",
                      item.current ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.name}
                  </Link>
                )
              })}
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <GitCommit className="h-3 w-3" title="Commit" />
              <span className="font-mono">{BUILD_INFO.commit.substring(0, 7)}</span>
              <span className="text-muted">|</span>
              <Calendar className="h-3 w-3" title="Build Date" />
              <span>{new Date(BUILD_INFO.buildDate).toLocaleDateString()}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <User className="h-4 w-4" />
              {userEmail}
            </div>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  )
}
