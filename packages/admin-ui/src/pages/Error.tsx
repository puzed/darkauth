import PageHeader from "@/components/layout/page-header";

const ErrorPage = () => {
  return (
    <div>
      <PageHeader title="Error" subtitle="Something went wrong" />
      <div style={{ padding: 24 }}>
        <a href="/">Return to Home</a>
      </div>
    </div>
  );
};

export default ErrorPage;
