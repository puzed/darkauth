import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import PageHeader from "@/components/layout/page-header";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div>
      <PageHeader title="404" subtitle="Page not found" />
      <div style={{ padding: 24 }}>
        <a href="/">Return to Home</a>
      </div>
    </div>
  );
};

export default NotFound;
