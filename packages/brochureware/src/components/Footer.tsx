import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Github, Twitter, Mail, ExternalLink } from "lucide-react";

const Footer = () => {
  const currentYear = new Date().getFullYear();

  const links = {
    product: [
      { name: "Features", href: "/features" },
      { name: "How It Works", href: "/how-it-works" },
      { name: "Security", href: "/security" },
      { name: "Changelog", href: "/changelog" }
    ],
    developers: [
      { name: "Documentation", href: "#docs" },
      { name: "API Reference", href: "/docs/api" },
      { name: "SDKs", href: "/docs/sdks" },
      { name: "GitHub", href: "https://github.com/darkauth" }
    ],
    company: [
      { name: "About", href: "/about" },
      { name: "Blog", href: "/blog" },
      { name: "Careers", href: "/careers" },
      { name: "Contact", href: "/contact" }
    ],
    legal: [
      { name: "Privacy Policy", href: "/legal/privacy" },
      { name: "Terms of Service", href: "/legal/terms" },
      { name: "Cookie Policy", href: "/legal/cookie" }
    ]
  };

  return (
    <footer className="bg-[hsl(var(--footer))] text-secondary-foreground border-t border-border/40">
      <div className="container max-w-7xl py-16">
        {/* Top Section */}
        <div className="grid lg:grid-cols-4 gap-8 mb-12">
          {/* Brand */}
          <div className="lg:col-span-1">
            <div className="flex items-center space-x-3 mb-4">
              <img 
                src="/logos/icon.svg" 
                alt="DarkAuth Logo" 
                className="h-8 w-8 dark:brightness-[100]"
              />
              <div>
                <span className="text-lg font-bold text-foreground">DarkAuth</span>
                <div className="flex items-center space-x-2 mt-1">
                  <Badge variant="outline" className="text-xs border-primary/30 text-primary">
                    RFC 9380
                  </Badge>
                </div>
              </div>
            </div>
            <p className="text-sm text-secondary-foreground/80 mb-6 max-w-xs">
              The world's first production-ready zero-knowledge authentication system. 
              Your password never leaves your device.
            </p>
            
            {/* Social Links */}
            <div className="flex space-x-4">
              <Button variant="ghost" size="sm" className="text-secondary-foreground/60 hover:text-foreground">
                <Github className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" className="text-secondary-foreground/60 hover:text-foreground">
                <Twitter className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" className="text-secondary-foreground/60 hover:text-foreground">
                <Mail className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Product Links */}
          <div>
            <h3 className="font-semibold text-foreground mb-4">Product</h3>
            <ul className="space-y-3">
              {links.product.map((link, index) => (
                <li key={index}>
                  <a 
                    href={link.href}
                    className="text-sm text-secondary-foreground/80 hover:text-foreground transition-smooth"
                  >
                    {link.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Developer Links */}
          <div>
            <h3 className="font-semibold text-foreground mb-4">Developers</h3>
            <ul className="space-y-3">
              {links.developers.map((link, index) => (
                <li key={index}>
                  <a 
                    href={link.href}
                    className="text-sm text-secondary-foreground/80 hover:text-foreground transition-smooth flex items-center"
                  >
                    {link.name}
                    {link.href.startsWith('http') && (
                      <ExternalLink className="ml-1 h-3 w-3" />
                    )}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Company & Legal */}
          <div className="space-y-8">
            <div>
              <h3 className="font-semibold text-foreground mb-4">Company</h3>
              <ul className="space-y-3">
                {links.company.map((link, index) => (
                  <li key={index}>
                    <a 
                      href={link.href}
                      className="text-sm text-secondary-foreground/80 hover:text-foreground transition-smooth"
                    >
                      {link.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-foreground mb-4">Legal</h3>
              <ul className="space-y-3">
                {links.legal.map((link, index) => (
                  <li key={index}>
                    <a 
                      href={link.href}
                      className="text-sm text-secondary-foreground/80 hover:text-foreground transition-smooth"
                    >
                      {link.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        
        <div className="border-t border-secondary-foreground/20 pt-8 mb-8">
          <div className="text-center">
            <p className="text-sm text-secondary-foreground/60 mb-4">Project Info</p>
            <div className="flex flex-wrap justify-center gap-4">
              <Badge variant="outline" className="border-primary/30 text-primary/80">Open Source</Badge>
              <Badge variant="outline" className="border-primary/30 text-primary/80">AGPL-3.0</Badge>
              <Badge variant="outline" className="border-primary/30 text-primary/80">Self-hosted</Badge>
              <Badge variant="outline" className="border-primary/30 text-primary/80">Docker Image</Badge>
            </div>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="border-t border-secondary-foreground/20 pt-8">
          <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
            <div className="text-sm text-secondary-foreground/60">
              © {currentYear} DarkAuth. All rights reserved. 
              <span className="ml-2">Your Password Never Leaves Your Device</span>
            </div>
            
            <div className="flex items-center space-x-6 text-sm text-secondary-foreground/60">
              <span>🔐 Zero-Knowledge Security</span>
              <span>🧩 Open Source</span>
              <span>🐳 Docker Available</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
