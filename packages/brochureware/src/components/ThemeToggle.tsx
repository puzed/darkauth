import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import { Moon, Sun } from "lucide-react"

const ThemeToggle = () => {
  const { theme, resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null
  const effective = theme === "system" ? resolvedTheme : theme
  const onClick = () => setTheme(effective === "dark" ? "light" : "dark")
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={effective === "dark" ? "Switch to light" : "Switch to dark"}
      title={effective === "dark" ? "Switch to light" : "Switch to dark"}
      onClick={onClick}
    >
      {effective === "dark" ? <Sun /> : <Moon />}
    </Button>
  )
}

export default ThemeToggle
