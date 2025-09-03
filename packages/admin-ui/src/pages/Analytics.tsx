import PageHeader from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Analytics() {
  return (
    <div>
      <PageHeader
        title="Analytics"
        subtitle="Usage analytics will be available here"
        actions={
          <>
            <Button variant="outline" disabled>
              Export
            </Button>
            <Button disabled>Refresh</Button>
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Not Available</CardTitle>
          <CardDescription>Analytics data is not implemented yet</CardDescription>
        </CardHeader>
        <CardContent>
          <div>No analytics data to display.</div>
        </CardContent>
      </Card>
    </div>
  );
}
