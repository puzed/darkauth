import Header from "@/components/Header";
import Hero from "@/components/Hero";
import ProblemSolution from "@/components/ProblemSolution";
import Features from "@/components/Features";
import HowItWorks from "@/components/HowItWorks";
import Security from "@/components/Security";
import UseCases from "@/components/UseCases";
import Documentation from "@/components/Documentation";
import Footer from "@/components/Footer";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <Hero />
      <ProblemSolution />
      <Features />
      <HowItWorks />
      <Security />
      <UseCases />
      <Documentation />
      <Footer />
    </div>
  );
};

export default Index;
