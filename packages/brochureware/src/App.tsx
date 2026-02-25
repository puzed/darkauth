import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "next-themes";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Changelog from "./pages/Changelog";
import NotFound from "./pages/NotFound";
import Screenshots from "./pages/Screenshots";
import Privacy from "./pages/legal/Privacy";
import Terms from "./pages/legal/Terms";
import Cookie from "./pages/legal/Cookie";
import HowItWorks from "./pages/HowItWorks";
import Security from "./pages/Security";
import Features from "./pages/Features";
import DocsLayout from "./pages/docs/DocsLayout";
import IntroductionPage from "./pages/docs/Introduction";
import QuickstartPage from "./pages/docs/Quickstart";
import ConceptsPage from "./pages/docs/Concepts";
import SecurityModelPage from "./pages/docs/concepts/SecurityModel";
import ArchitecturePage from "./pages/docs/concepts/Architecture";
import PublicClientFlowPage from "./pages/docs/guides/PublicClientFlow";
import ConfidentialClientFlowPage from "./pages/docs/guides/ConfidentialClientFlow";
import UsersDirectoryGuidePage from "./pages/docs/guides/UsersDirectory";
import OrganizationsRbacPage from "./pages/docs/guides/OrganizationsRbac";
import OtpPolicyPage from "./pages/docs/guides/OtpPolicy";
import ApiOverviewPage from "./pages/docs/api/ApiOverview";
import ApiAuthPage from "./pages/docs/api/Auth";
import ApiOpaquePage from "./pages/docs/api/Opaque";
import ApiOtpPage from "./pages/docs/api/Otp";
import ApiCryptoPage from "./pages/docs/api/Crypto";
import ApiUsersDirectoryPage from "./pages/docs/api/UsersDirectory";
import ApiOrganizationsPage from "./pages/docs/api/Organizations";
import ApiAdminPage from "./pages/docs/api/Admin";
import ApiInstallationPage from "./pages/docs/api/Installation";
import ApiOpenApiPage from "./pages/docs/api/OpenApi";
import SdkOverviewPage from "./pages/docs/sdks/Overview";
import DeploymentsPage from "./pages/docs/operations/Deployment";
import BrandingPage from "./pages/docs/operations/Branding";
import TroubleshootingPage from "./pages/docs/operations/Troubleshooting";
import AuthenticationPage from "./pages/docs/developers/client-apis/Authentication";
import UsersApiPage from "./pages/docs/developers/client-apis/UsersApi";
import ScrollToTop from "./components/ScrollToTop";

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem enableColorScheme storageKey="darkauth-theme">
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/features" element={<Features />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="/security" element={<Security />} />
          <Route path="/changelog" element={<Changelog />} />
          <Route path="/screenshots" element={<Screenshots />} />
          <Route path="/legal/privacy" element={<Privacy />} />
          <Route path="/legal/terms" element={<Terms />} />
          <Route path="/legal/cookie" element={<Cookie />} />
          <Route path="/docs" element={<DocsLayout />}>
            <Route index element={<IntroductionPage />} />
            <Route path="introduction" element={<IntroductionPage />} />
            <Route path="quickstart" element={<QuickstartPage />} />
            <Route path="concepts" element={<ConceptsPage />} />
            <Route path="concepts/security-model" element={<SecurityModelPage />} />
            <Route path="concepts/architecture" element={<ArchitecturePage />} />
            <Route path="guides/public-client-flow" element={<PublicClientFlowPage />} />
            <Route path="guides/confidential-client-flow" element={<ConfidentialClientFlowPage />} />
            <Route path="guides/users-directory" element={<UsersDirectoryGuidePage />} />
            <Route path="guides/organizations-rbac" element={<OrganizationsRbacPage />} />
            <Route path="guides/otp-policy" element={<OtpPolicyPage />} />
            <Route path="api" element={<ApiOverviewPage />} />
            <Route path="api/overview" element={<ApiOverviewPage />} />
            <Route path="api/auth" element={<ApiAuthPage />} />
            <Route path="api/opaque" element={<ApiOpaquePage />} />
            <Route path="api/otp" element={<ApiOtpPage />} />
            <Route path="api/crypto" element={<ApiCryptoPage />} />
            <Route path="api/users-directory" element={<ApiUsersDirectoryPage />} />
            <Route path="api/organizations" element={<ApiOrganizationsPage />} />
            <Route path="api/admin" element={<ApiAdminPage />} />
            <Route path="api/installation" element={<ApiInstallationPage />} />
            <Route path="api/openapi" element={<ApiOpenApiPage />} />
            <Route path="sdks" element={<SdkOverviewPage />} />
            <Route path="operations/deployment" element={<DeploymentsPage />} />
            <Route path="operations/branding" element={<BrandingPage />} />
            <Route path="operations/troubleshooting" element={<TroubleshootingPage />} />
            <Route path="developers/client-apis/authentication" element={<AuthenticationPage />} />
            <Route path="developers/client-apis/users" element={<UsersApiPage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </ThemeProvider>
);

export default App;
