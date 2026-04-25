import { Moon, Sun } from "lucide-react"
import { useTheme } from "@/components/ui/theme-provider"
import { Button } from "@/components/ui/button"

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : theme === "light" ? "system" : "dark")
  }

  return (
    <Button variant="ghost" size="icon" onClick={toggleTheme}>
      {theme === "dark" ? (
        <Moon className="h-4 w-4" />
      ) : theme === "light" ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Sun className="h-4 w-4" />
      )}
    </Button>
  )
}