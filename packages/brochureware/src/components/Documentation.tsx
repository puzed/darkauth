import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  BookOpen, 
  Code, 
  Zap, 
  Settings, 
  Shield,
  ArrowRight,
  ExternalLink,
  Copy
} from "lucide-react";
import { useEffect, useState } from "react";
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import yaml from 'highlight.js/lib/languages/yaml';
import 'highlight.js/styles/github-dark-dimmed.css';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

hljs.registerLanguage('bash', bash);
hljs.registerLanguage('yaml', yaml);

const Documentation = () => {
  const quickStart = [
    {
      step: "1",
      title: "Run with Docker",
      code: `docker run -d \
  -p 9080:9080 \
  -p 9081:9081 \
  ghcr.io/puzed/darkauth:latest`,
      lang: "bash",
      description: "Self-hosted. Exposes user port 9080 and admin port 9081"
    },
    {
      step: "2",
      title: "Run with Docker Compose",
      code: `version: '3.8'
services:
  darkauth:
    image: ghcr.io/puzed/darkauth:latest
    ports:
      - "9080:9080"
      - "9081:9081"
    volumes:
      - ./config.yaml:/app/config.yaml:ro
    depends_on:
      - postgres
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: DarkAuth
      POSTGRES_USER: DarkAuth
      POSTGRES_PASSWORD: DarkAuth_password
    volumes:
      - postgres_data:/var/lib/postgresql/data
volumes:
  postgres_data:`,
      lang: "yaml",
      description: "docker-compose.yml example including PostgreSQL and config mount"
    },
    {
      step: "3",
      title: "Run with Kubernetes",
      code: `apiVersion: v1
kind: ConfigMap
metadata:
  name: darkauth-config
data:
  config.yaml: |
    postgresUri: postgresql://DarkAuth:DarkAuth_password@postgres:5432/DarkAuth
    kekPassphrase: "change-me"
    userPort: 9080
    adminPort: 9081
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: darkauth
spec:
  replicas: 1
  selector:
    matchLabels:
      app: darkauth
  template:
    metadata:
      labels:
        app: darkauth
    spec:
      containers:
        - name: darkauth
          image: ghcr.io/puzed/darkauth:latest
          ports:
            - containerPort: 9080
            - containerPort: 9081
          volumeMounts:
            - name: config
              mountPath: /app/config.yaml
              subPath: config.yaml
      volumes:
        - name: config
          configMap:
            name: darkauth-config
---
apiVersion: v1
kind: Service
metadata:
  name: darkauth-user
spec:
  type: LoadBalancer
  selector:
    app: darkauth
  ports:
    - port: 9080
      targetPort: 9080
---
apiVersion: v1
kind: Service
metadata:
  name: darkauth-admin
spec:
  type: LoadBalancer
  selector:
    app: darkauth
  ports:
    - port: 9081
      targetPort: 9081`,
      lang: "yaml",
      description: "Kubernetes manifests for config, deployment, and services"
    }
  ];

  const resources = [
    {
      icon: BookOpen,
      title: "API Documentation",
      description: "Complete REST API reference with examples",
      link: "/docs/api",
      badge: "Interactive"
    },
    {
      icon: Code,
      title: "Integration Guides",
      description: "Step-by-step guides for popular frameworks",
      link: "/docs/guides/public-client-flow",
      badge: "Code Examples"
    },
    {
      icon: Shield,
      title: "Security Model",
      description: "Deep dive into OPAQUE protocol implementation",
      link: "/docs/concepts/security-model",
      badge: "Technical"
    },
    {
      icon: Settings,
      title: "Deployment Guide", 
      description: "Production deployment and configuration",
      link: "/docs/operations/deployment",
      badge: "DevOps"
    }
  ];

  const sdks = [
    { name: "TypeScript/JavaScript", status: "Stable", version: "v0.1.0" }
  ];

  const [tab, setTab] = useState("compose");

  useEffect(() => {
    requestAnimationFrame(() => {
      document
        .querySelectorAll('code[class^="language-"]')
        .forEach((el) => hljs.highlightElement(el as HTMLElement));
    });
  }, [tab]);

  return (
    <section id="docs" className="py-20 bg-gradient-subtle">
      <div className="container max-w-7xl">
        {/* Header */}
        <div className="text-center mb-16">
          <Badge variant="outline" className="mb-4 border-primary/20 text-primary">
            <BookOpen className="mr-2 h-4 w-4" />
            Developer Resources
          </Badge>
          <h2 className="text-4xl font-bold text-foreground mb-4">
            Get Started in Under 5 Minutes
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Comprehensive documentation, SDKs, and examples to get you up and running 
            with zero-knowledge authentication quickly.
          </p>
        </div>

        {/* Quick Start */}
        <div className="mb-16">
          <h3 className="text-2xl font-bold text-foreground mb-8 text-center">Quick Start Guide</h3>
          <Tabs value={tab} onValueChange={setTab} defaultValue="compose" className="w-full">
            <div className="flex justify-center">
              <TabsList className="mb-6">
                <TabsTrigger value="docker">Docker</TabsTrigger>
                <TabsTrigger value="compose">Docker Compose</TabsTrigger>
                <TabsTrigger value="kubernetes">Kubernetes</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="docker">
              <Card className="group hover:shadow-card transition-smooth bg-background/80 backdrop-blur">
                <CardHeader>
                  <div className="flex items-center space-x-3 mb-3">
                    <div className="bg-gradient-primary text-white rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold">1</div>
                    <CardTitle className="text-lg">Run with Docker</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="bg-secondary/20 rounded-lg mb-4 border border-border/30 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2 border-b border-border/30">
                      <span className="text-xs text-muted-foreground">BASH</span>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:bg-primary/20">
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                    <pre className="text-xs sm:text-sm font-mono text-foreground whitespace-pre overflow-x-auto p-4">
                      <code className="language-bash">{quickStart[0].code}</code>
                    </pre>
                  </div>
                  <p className="text-sm text-muted-foreground">{quickStart[0].description}</p>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="compose">
              <Card className="group hover:shadow-card transition-smooth bg-background/80 backdrop-blur">
                <CardHeader>
                  <div className="flex items-center space-x-3 mb-3">
                    <div className="bg-gradient-primary text-white rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold">2</div>
                    <CardTitle className="text-lg">Run with Docker Compose</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="bg-secondary/20 rounded-lg mb-4 border border-border/30 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2 border-b border-border/30">
                      <span className="text-xs text-muted-foreground">YAML</span>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:bg-primary/20">
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                    <pre className="text-xs sm:text-sm font-mono text-foreground whitespace-pre overflow-x-auto p-4">
                      <code className="language-yaml">{quickStart[1].code}</code>
                    </pre>
                  </div>
                  <p className="text-sm text-muted-foreground">{quickStart[1].description}</p>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="kubernetes">
              <Card className="group hover:shadow-card transition-smooth bg-background/80 backdrop-blur">
                <CardHeader>
                  <div className="flex items-center space-x-3 mb-3">
                    <div className="bg-gradient-primary text-white rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold">3</div>
                    <CardTitle className="text-lg">Run with Kubernetes</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="bg-secondary/20 rounded-lg mb-4 border border-border/30 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2 border-b border-border/30">
                      <span className="text-xs text-muted-foreground">YAML</span>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:bg-primary/20">
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                    <pre className="text-xs sm:text-sm font-mono text-foreground whitespace-pre overflow-x-auto p-4">
                      <code className="language-yaml">{quickStart[2].code}</code>
                    </pre>
                  </div>
                  <p className="text-sm text-muted-foreground">{quickStart[2].description}</p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Interactive Demo */}
        <div className="text-center bg-background rounded-2xl p-8 shadow-card border border-border/30">
          <Zap className="h-12 w-12 text-primary mx-auto mb-4" />
          <h3 className="text-2xl font-bold text-foreground mb-4">
            Try DarkAuth in Your Browser
          </h3>
          <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
            Experience zero-knowledge authentication firsthand with our interactive demo. 
            See how passwords never leave the browser while maintaining full OIDC compatibility.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button variant="hero" size="lg">
              Launch Interactive Demo
            </Button>
            <a href="https://github.com/puzed/" target="_blank" rel="noreferrer">
              <Button variant="outline" size="lg">
                View Source Code
              </Button>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Documentation;
