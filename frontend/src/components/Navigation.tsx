import { Link, useLocation } from "react-router-dom"
import { useEffect, useState } from "react"
import { Database, User, GitCommit, Calendar } from "lucide-react"
import { cn } from "@/lib/utils"
import { ThemeToggle } from "@/components/theme-toggle"
import { BUILD_INFO } from "@/lib/build-info"

export function Navigation() {
  const location = useLocation()
  const [userEmail, setUserEmail] = useState("Loading...")

  useEffect(() => {
    const email = localStorage.getItem("userEmail") || "user@example.com"
    setUserEmail(email)
  }, [])

  const navigation = [
    {
      name: "Dashboard",
      href: "/dashboard",
      icon: Database,
      current: location.pathname === "/dashboard",
    },
  ]

  return (
    <header className="border-b">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-8">
            <Link to="/dashboard" className="flex items-center gap-2 font-bold text-xl">
              <Database className="h-6 w-6" />
              pgweb
            </Link>

            <nav className="flex items-center gap-6">
              {navigation.map((item) => {
                const Icon = item.icon
                return (
                  <Link
                    key={item.name}
                    to={item.href}
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
              <GitCommit className="h-3 w-3" />
              <span className="font-mono">{BUILD_INFO.commit.substring(0, 7)}</span>
              <span className="text-muted">|</span>
              <Calendar className="h-3 w-3" />
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