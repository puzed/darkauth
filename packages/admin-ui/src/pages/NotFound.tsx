import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import PageHeader from "@/components/layout/page-header";
import { logger } from "@/services/logger";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    logger.error({ path: location.pathname }, "404 route access");
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
