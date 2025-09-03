import { Button } from "@/components/ui/button";
import ThemeToggle from "@/components/ThemeToggle";

const Header = () => {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 max-w-7xl items-center justify-between">
        {/* Logo and Brand */}
        <a href="/" className="flex items-center space-x-3">
          <img src="/favicon.svg" alt="DarkAuth Logo" className="h-10 w-10 dark:brightness-[100]" />
          <div className="flex flex-col">
            <span className="text-xl font-bold text-foreground">DarkAuth</span>
            <span className="text-xs text-muted-foreground">Zero-Knowledge Auth</span>
          </div>
        </a>

        {/* Navigation */}
        <nav className="hidden md:flex items-center space-x-6 text-sm font-medium">
          <a href="#features" className="transition-smooth hover:text-primary">Features</a>
          <a href="#how-it-works" className="transition-smooth hover:text-primary">How It Works</a>
          <a href="#security" className="transition-smooth hover:text-primary">Security</a>
          <a href="#docs" className="transition-smooth hover:text-primary">Documentation</a>
          <a href="#pricing" className="transition-smooth hover:text-primary">Pricing</a>
          <a href="/screenshots" className="transition-smooth hover:text-primary">Screenshots</a>
          <a href="/changelog" className="transition-smooth hover:text-primary">Changelog</a>
        </nav>

        <div className="flex items-center space-x-3">
          <ThemeToggle />
          <Button variant="ghost" size="sm">
            GitHub
          </Button>
          <Button variant="hero" size="sm">
            Start Free
          </Button>
        </div>
      </div>
    </header>
  );
};

export default Header;
