import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

type DocsCalloutProps = {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
};

const DocsCallout = ({ title, icon: Icon, children }: DocsCalloutProps) => {
  return (
    <Alert className="border-primary/25 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent shadow-sm">
      <Icon className="mt-0.5 h-4 w-4" />
      <AlertTitle className="text-base">{title}</AlertTitle>
      <AlertDescription className="mt-2 text-sm leading-6 text-muted-foreground">{children}</AlertDescription>
    </Alert>
  );
};

export default DocsCallout;
