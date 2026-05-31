import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Features from "./pages/Features";
import ZkPasswords from "./pages/features/ZkPasswords";
import ZkKeys from "./pages/features/ZkKeys";
import Oidc from "./pages/features/Oidc";
import Mfa from "./pages/features/Mfa";
import OrgsRbac from "./pages/features/OrgsRbac";
import Federation from "./pages/features/Federation";
import Scim from "./pages/features/Scim";
import Branding from "./pages/features/Branding";
import Admin from "./pages/features/Admin";
import HowItWorks from "./pages/HowItWorks";
import Security from "./pages/Security";
import Whitepaper from "./pages/security/Whitepaper";
import ZeroKnowledge from "./pages/security/ZeroKnowledge";
import UseCases from "./pages/UseCases";
import Screenshots from "./pages/Screenshots";
import Developers from "./pages/Developers";
import Quickstart from "./pages/developers/Quickstart";
import Sdk from "./pages/developers/Sdk";
import OidcRef from "./pages/developers/OidcRef";
import SelfHost from "./pages/SelfHost";
import OpenSource from "./pages/OpenSource";
import ScrollToTop from "./components/ScrollToTop";

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/features" element={<Features />} />
        <Route path="/features/zero-knowledge-passwords" element={<ZkPasswords />} />
        <Route path="/features/zero-knowledge-keys" element={<ZkKeys />} />
        <Route path="/features/oidc" element={<Oidc />} />
        <Route path="/features/mfa" element={<Mfa />} />
        <Route path="/features/organizations-rbac" element={<OrgsRbac />} />
        <Route path="/features/federation" element={<Federation />} />
        <Route path="/features/scim" element={<Scim />} />
        <Route path="/features/branding" element={<Branding />} />
        <Route path="/features/admin" element={<Admin />} />
        <Route path="/how-it-works" element={<HowItWorks />} />
        <Route path="/security" element={<Security />} />
        <Route path="/security/whitepaper" element={<Whitepaper />} />
        <Route path="/security/zero-knowledge" element={<ZeroKnowledge />} />
        <Route path="/use-cases" element={<UseCases />} />
        <Route path="/screenshots" element={<Screenshots />} />
        <Route path="/developers" element={<Developers />} />
        <Route path="/developers/quickstart" element={<Quickstart />} />
        <Route path="/developers/sdk" element={<Sdk />} />
        <Route path="/developers/oidc" element={<OidcRef />} />
        <Route path="/self-host" element={<SelfHost />} />
        <Route path="/open-source" element={<OpenSource />} />
      </Routes>
    </>
  );
}
