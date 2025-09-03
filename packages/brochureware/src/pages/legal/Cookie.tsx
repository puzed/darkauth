import Footer from "@/components/Footer";
import Header from "@/components/Header";

const Cookie = () => {
  return (
    <div className="min-h-screen">
      <Header />
      <main className="container mx-auto px-6 pt-28 pb-16">
        <section className="legal-content">
          <h1>Cookie Policy</h1>
          <p>Last updated: August 2025</p>

          <p>
            This Cookie Policy explains how Puzed Ltd uses cookies and similar technologies on our websites, including the DarkAuth websites and <a href="https://puzed.com">puzed.com</a>. DarkAuth is a product owned and operated by Puzed Ltd. This policy should be read together with our <a href="/legal/privacy">Privacy Policy</a>.
          </p>

          <h2>What Are Cookies?</h2>
          <p>
            Cookies are small text files that are stored on your device when you visit a website. They help the site remember information about your visit, which can make your next visit easier and the site more useful to you.
          </p>

          <h2>How We Use Cookies</h2>
          <p>We use cookies to:</p>
          <ul>
            <li>Remember your preferences.</li>
            <li>Improve site performance and security.</li>
            <li>Understand how the site is used to help us improve it.</li>
          </ul>

          <h2>Types of Cookies We Use</h2>
          <ul>
            <li><strong>Strictly Necessary Cookies:</strong> Required for the site to function.</li>
            <li><strong>Performance Cookies:</strong> Aggregate analytics about how visitors use our site.</li>
            <li><strong>Functional Cookies:</strong> Remember choices you make to provide enhanced features.</li>
          </ul>

          <h2>Third-Party Cookies</h2>
          <p>
            We may use trusted third-party tools to help us measure site performance and usage. These providers may set their own cookies. We do not use cookies for targeted advertising.
          </p>

          <h2>Managing Cookies</h2>
          <p>
            You can control cookies through your browser settings. Most browsers allow you to refuse or delete cookies. If you disable cookies, some features of our site may not function as intended.
          </p>

          <h2>Changes to This Policy</h2>
          <p>
            We may update this Cookie Policy from time to time. Any changes will be posted on this page with an updated date.
          </p>

          <h2>Contact Us</h2>
          <p>
            If you have any questions about our use of cookies, please contact us at <a href="mailto:legal@puzed.com">legal@puzed.com</a>.
          </p>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default Cookie;
