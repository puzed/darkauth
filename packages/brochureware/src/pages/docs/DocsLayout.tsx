import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Folder, FileText } from "lucide-react";
import { Link, Outlet, useLocation } from "react-router-dom";

function sidebarItemClass(isActive: boolean) {
  if (isActive) {
    return "flex items-center gap-2 rounded-md bg-primary/10 px-3 py-2 text-base text-primary";
  }

  return "flex items-center gap-2 rounded-md px-3 py-2 text-base text-muted-foreground hover:bg-muted hover:text-foreground";
}

const DocsLayout = () => {
  const location = useLocation();
  const isIntroductionActive =
    location.pathname === "/docs" || location.pathname === "/docs/introduction";
  const isAuthenticationActive =
    location.pathname === "/docs/developers/client-apis/authentication";
  const isUsersApiActive =
    location.pathname === "/docs/developers/client-apis/users";

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <section className="py-12">
        <div className="container max-w-7xl">
          <div className="mb-6">
            <Badge variant="outline" className="border-primary/30 text-primary">
              <BookOpen className="mr-2 h-4 w-4" />
              Documentation
            </Badge>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-foreground">DarkAuth Docs</h1>
          </div>

          <div className="grid gap-6 md:grid-cols-[280px_1fr]">
            <Card className="h-fit border-border/50">
              <CardContent className="p-4">
                <nav className="space-y-2">
                  <Link to="/docs/introduction" className={sidebarItemClass(isIntroductionActive)}>
                    <FileText className="h-4 w-4" />
                    <span>Introduction</span>
                  </Link>

                  <div className="rounded-md border border-border/50 p-2">
                    <div className="flex items-center gap-2 px-2 py-1 text-base font-medium text-foreground">
                      <Folder className="h-4 w-4" />
                      <span>Developers</span>
                    </div>
                    <div className="mt-1 ml-4 rounded-md border border-border/50 p-2">
                      <div className="flex items-center gap-2 px-2 py-1 text-base font-medium text-foreground">
                        <Folder className="h-4 w-4" />
                        <span>Client APIs</span>
                      </div>
                      <div className="mt-1 ml-4">
                        <Link
                          to="/docs/developers/client-apis/authentication"
                          className={sidebarItemClass(isAuthenticationActive)}
                        >
                          <FileText className="h-4 w-4" />
                          <span>Authentication</span>
                        </Link>
                        <Link
                          to="/docs/developers/client-apis/users"
                          className={sidebarItemClass(isUsersApiActive)}
                        >
                          <FileText className="h-4 w-4" />
                          <span>Users (/api/users)</span>
                        </Link>
                      </div>
                    </div>
                  </div>
                </nav>
              </CardContent>
            </Card>

            <main>
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
