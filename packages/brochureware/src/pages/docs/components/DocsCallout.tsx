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
    <Alert className="border-primary/30 bg-primary/10">
      <Icon className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
};

export default DocsCallout;
