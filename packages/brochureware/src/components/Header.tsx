import { Button } from "@/components/ui/button";
import ThemeToggle from "@/components/ThemeToggle";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu } from "lucide-react";

const Header = () => {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 max-w-7xl items-center justify-between">
        <a href="/" className="flex items-center space-x-3">
          <img src="/favicon.svg" alt="DarkAuth Logo" className="h-10 w-10 dark:brightness-[100]" />
          <div className="flex flex-col">
            <span className="text-xl font-bold text-foreground">DarkAuth</span>
            <span className="text-xs text-muted-foreground">Zero-Knowledge Auth</span>
          </div>
        </a>

        <nav className="hidden md:flex items-center space-x-6 text-sm font-medium">
          <a href="#features" className="transition-smooth hover:text-primary">Features</a>
          <a href="#how-it-works" className="transition-smooth hover:text-primary">How It Works</a>
          <a href="#security" className="transition-smooth hover:text-primary">Security</a>
          <a href="#docs" className="transition-smooth hover:text-primary">Documentation</a>
          
          <a href="/screenshots" className="transition-smooth hover:text-primary">Screenshots</a>
          <a href="/changelog" className="transition-smooth hover:text-primary">Changelog</a>
        </nav>

        <div className="flex items-center space-x-3">
          <ThemeToggle />
          <Button variant="ghost" size="sm" className="hidden md:inline-flex">
            GitHub
          </Button>
          <a href="#docs">
            <Button variant="hero" size="sm" className="hidden md:inline-flex">
              Run with Docker
            </Button>
          </a>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="md:hidden" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full sm:max-w-sm">
              <div className="px-1 py-2 space-y-2">
                <a href="#features" className="block px-2 py-2 rounded-md hover:bg-muted">Features</a>
                <a href="#how-it-works" className="block px-2 py-2 rounded-md hover:bg-muted">How It Works</a>
                <a href="#security" className="block px-2 py-2 rounded-md hover:bg-muted">Security</a>
                <a href="#docs" className="block px-2 py-2 rounded-md hover:bg-muted">Documentation</a>
                <a href="/screenshots" className="block px-2 py-2 rounded-md hover:bg-muted">Screenshots</a>
                <a href="/changelog" className="block px-2 py-2 rounded-md hover:bg-muted">Changelog</a>
                <div className="pt-3 flex gap-2">
                  <Button variant="ghost" className="flex-1">GitHub</Button>
                  <a href="#docs" className="flex-1">
                    <Button variant="hero" className="w-full">Run with Docker</Button>
                  </a>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
};

export default Header;
