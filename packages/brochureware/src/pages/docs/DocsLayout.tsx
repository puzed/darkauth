import { Link, Outlet, useLocation } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { docsSections, type DocsLink } from "./docsNavigation";

function isActive(path: string, locationPath: string) {
  if (path === "/docs") {
    return locationPath === "/docs" || locationPath === "/docs/introduction";
  }

  if (path === "/how-it-works" || path === "/changelog") {
    return locationPath === path;
  }

  return locationPath === path || locationPath.startsWith(`${path}/`);
}

function navLinkClass(active: boolean) {
  if (active) {
    return "docs-nav-link docs-nav-link-active";
  }

  return "docs-nav-link";
}

function sectionLinks(links: DocsLink[], locationPath: string) {
  return links.map((link) => (
    <Link key={link.path} to={link.path} className={navLinkClass(isActive(link.path, locationPath))}>
      <span>{link.title}</span>
    </Link>
  ));
}

const DocsLayout = () => {
  const location = useLocation();

  return (
    <div className="docs-shell min-h-screen">
      <Header />
      <section className="py-10 md:py-14">
        <div className="container max-w-7xl">
          <div className="mb-8 md:mb-12">
            <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">DarkAuth Docs</h1>
            <p className="mt-3 max-w-3xl text-base text-muted-foreground md:text-lg">
              Integrator-first documentation for implementation, API usage, and deployment.
            </p>
          </div>

          <div className="grid items-start gap-8 lg:grid-cols-[290px_minmax(0,1fr)] xl:gap-10">
            <Card className="docs-sidebar h-fit border-border/70 bg-card/95 shadow-sm">
              <CardContent className="p-0">
                <nav className="docs-sidebar-nav">
                  {docsSections.map((section) => (
                    <div key={section.title} className="docs-nav-section">
                      <div className="docs-nav-section-title">
                        <section.icon className="h-4 w-4" />
                        <span>{section.title}</span>
                      </div>
                      <div className="space-y-0.5">{sectionLinks(section.links, location.pathname)}</div>
                    </div>
                  ))}
                </nav>
              </CardContent>
            </Card>

            <main className="docs-content min-w-0">
              <Outlet />
            </main>
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
};

export default DocsLayout;
