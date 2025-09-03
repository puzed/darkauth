import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Star, Zap, Building2, Code } from "lucide-react";

const Pricing = () => {
  const plans = [
    {
      name: "Open Source",
      price: "Free",
      period: "forever",
      description: "Perfect for developers and small projects",
      icon: Code,
      features: [
        "Full OPAQUE protocol implementation",
        "Unlimited users and applications",
        "Complete source code access",
        "Community support",
        "Self-hosted deployment",
        "MIT license"
      ],
      limitations: [
        "Community support only",
        "Self-managed updates",
        "No SLA guarantees"
      ],
      cta: "Download Free",
      variant: "outline" as const,
      popular: false
    },
    {
      name: "Cloud",
      price: "$99",
      period: "per month",
      description: "Managed service for growing companies",
      icon: Zap,
      features: [
        "Everything in Open Source",
        "Fully managed hosting",
        "Automatic updates",
        "99.9% uptime SLA",
        "Email support",
        "Monitoring dashboard",
        "Backup & recovery",
        "Up to 10,000 active users"
      ],
      limitations: [
        "10,000 user limit",
        "Email support only"
      ],
      cta: "Start Free Trial",
      variant: "hero" as const,
      popular: true
    },
    {
      name: "Enterprise",
      price: "Custom",
      period: "pricing",
      description: "Advanced features for large organizations",
      icon: Building2,
      features: [
        "Everything in Cloud",
        "Unlimited users",
        "Priority support",
        "Custom deployment options",
        "Dedicated account manager",
        "Security audits & certifications",
        "Custom integrations",
        "On-premise deployment"
      ],
      limitations: [],
      cta: "Contact Sales",
      variant: "accent" as const,
      popular: false
    }
  ];

  const addOns = [
    {
      name: "Professional Support",
      price: "$500/month",
      description: "Priority email & chat support with 4-hour response SLA"
    },
    {
      name: "Security Audit",
      price: "$5,000",
      description: "Third-party security audit with detailed report and remediation guidance"
    },
    {
      name: "Custom Integration",
      price: "Quote",
      description: "Custom SDK development or integration assistance from our team"
    }
  ];

  return (
    <section id="pricing" className="py-20 bg-background">
      <div className="container max-w-7xl">
        {/* Header */}
        <div className="text-center mb-16">
          <Badge variant="outline" className="mb-4 border-accent/20 text-accent">
            <Star className="mr-2 h-4 w-4" />
            Transparent Pricing
          </Badge>
          <h2 className="text-4xl font-bold text-foreground mb-4">
            Choose Your Security Level
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            From open-source freedom to enterprise-grade support, DarkAuth scales 
            with your security needs without compromising on features.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid lg:grid-cols-3 gap-8 mb-16">
          {plans.map((plan, index) => (
            <Card 
              key={index} 
              className={`relative group hover:shadow-elegant transition-smooth ${
                plan.popular ? 'border-primary shadow-glow' : 'border-border/50'
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <Badge className="bg-gradient-primary text-white border-0 shadow-md">
                    <Star className="mr-1 h-3 w-3" />
                    Most Popular
                  </Badge>
                </div>
              )}
              
              <CardHeader className="text-center pb-4">
                <div className="mb-4">
                  <plan.icon className={`h-12 w-12 mx-auto ${
                    plan.popular ? 'text-primary' : 'text-muted-foreground'
                  }`} />
                </div>
                <CardTitle className="text-2xl font-bold text-foreground mb-2">
                  {plan.name}
                </CardTitle>
                <div className="mb-4">
                  <span className={`text-4xl font-bold ${
                    plan.popular ? 'text-primary' : 'text-foreground'
                  }`}>
                    {plan.price}
                  </span>
                  {plan.period && (
                    <span className="text-muted-foreground ml-2">/{plan.period}</span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {plan.description}
                </p>
              </CardHeader>
              
              <CardContent className="space-y-4">
                {/* Features */}
                <div className="space-y-3">
                  {plan.features.map((feature, idx) => (
                    <div key={idx} className="flex items-start space-x-3">
                      <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                      <span className="text-sm text-foreground">{feature}</span>
                    </div>
                  ))}
                </div>
                
                {/* Limitations */}
                {plan.limitations.length > 0 && (
                  <div className="pt-4 border-t border-border/30">
                    <p className="text-xs text-muted-foreground mb-2 font-medium">Limitations:</p>
                    <div className="space-y-1">
                      {plan.limitations.map((limitation, idx) => (
                        <p key={idx} className="text-xs text-muted-foreground">
                          • {limitation}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* CTA */}
                <div className="pt-6">
                  <Button variant={plan.variant} className="w-full" size="lg">
                    {plan.cta}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Add-ons */}
        <div className="mb-16">
          <h3 className="text-2xl font-bold text-foreground mb-8 text-center">
            Professional Add-ons
          </h3>
          
          <div className="grid md:grid-cols-3 gap-6">
            {addOns.map((addon, index) => (
              <Card key={index} className="hover:shadow-card transition-smooth border-border/50">
                <CardContent className="p-6 text-center">
                  <h4 className="font-semibold text-foreground mb-2">{addon.name}</h4>
                  <div className="text-2xl font-bold text-primary mb-3">{addon.price}</div>
                  <p className="text-sm text-muted-foreground">{addon.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* FAQ */}
        <div className="bg-gradient-subtle rounded-2xl p-8 shadow-card">
          <h3 className="text-2xl font-bold text-foreground mb-8 text-center">
            Pricing FAQ
          </h3>
          
          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div>
                <h4 className="font-semibold text-foreground mb-2">Is the open-source version feature-complete?</h4>
                <p className="text-sm text-muted-foreground">
                  Yes! The open-source version includes the complete OPAQUE implementation, 
                  zero-knowledge features, and OIDC compatibility. Cloud and Enterprise add 
                  managed services and support.
                </p>
              </div>
              
              <div>
                <h4 className="font-semibold text-foreground mb-2">What's included in the free trial?</h4>
                <p className="text-sm text-muted-foreground">
                  The Cloud free trial includes all features for 30 days with up to 1,000 users. 
                  No credit card required.
                </p>
              </div>
            </div>
            
            <div className="space-y-6">
              <div>
                <h4 className="font-semibold text-foreground mb-2">Can I migrate from open-source to Cloud?</h4>
                <p className="text-sm text-muted-foreground">
                  Absolutely! We provide migration tools and support to seamlessly move 
                  from self-hosted to our managed cloud service.
                </p>
              </div>
              
              <div>
                <h4 className="font-semibold text-foreground mb-2">What does Enterprise support include?</h4>
                <p className="text-sm text-muted-foreground">
                  Enterprise includes dedicated Slack channel, video calls, custom deployment 
                  assistance, and priority feature requests with direct engineering access.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="text-center mt-16">
          <div className="inline-flex flex-col items-center bg-gradient-primary p-8 rounded-2xl shadow-glow text-white">
            <h3 className="text-2xl font-bold mb-2">Ready to Eliminate Password Breaches?</h3>
            <p className="text-white/80 mb-6 max-w-md">
              Join organizations that have made password breaches mathematically impossible.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button variant="outline" className="bg-white/10 border-white/20 text-white hover:bg-white/20">
                Start Free Trial
              </Button>
              <Button variant="outline" className="bg-white/10 border-white/20 text-white hover:bg-white/20">
                Schedule Demo
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Pricing;