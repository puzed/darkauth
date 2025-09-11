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

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem enableColorScheme storageKey="darkauth-theme">
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
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
        <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </ThemeProvider>
);

export default App;
