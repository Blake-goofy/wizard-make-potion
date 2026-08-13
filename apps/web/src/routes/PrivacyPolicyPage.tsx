export default function PrivacyPolicyPage() {
  return (
    <section className="content-panel legal-page">
      <div className="legal-page-header">
        <p className="eyebrow">Legal</p>
        <h1>Privacy Policy</h1>
        <p className="status-text">
          This policy explains how Wizard Make Potion handles website, order, account, and SMS messaging information.
        </p>
      </div>

      <div className="legal-copy">
        <section>
          <h2>Information We Collect</h2>
          <p>
            We collect the information you provide directly to us, such as your name, email address, mobile phone number,
            ticket purchases, and account preferences.
          </p>
        </section>

        <section>
          <h2>How We Use Information</h2>
          <p>
            We use your information to process ticket purchases, maintain your account, send order confirmations by email,
            and send SMS messages you have agreed to receive, including event reminders and updates about new events or
            ticket releases.
          </p>
        </section>

        <section>
          <h2>SMS Privacy</h2>
          <p>
            Your mobile information will not be sold or shared with third parties for promotional or marketing purposes.
          </p>
          <p>
            We do not transfer your mobile opt-in data or consent to third parties for their own marketing. We may share
            limited information with service providers only as needed to operate our website, process orders, and deliver the
            messages you requested.
          </p>
        </section>

        <section>
          <h2>Your Choices</h2>
          <p>
            You can choose whether to receive text messages by leaving the SMS checkbox unchecked, updating your account
            preferences, or replying STOP to any text message. You can reply HELP for assistance.
          </p>
        </section>

        <section>
          <h2>Policy Updates</h2>
          <p>
            We may update this policy from time to time. When we do, the updated version will be posted on this page.
          </p>
        </section>
      </div>

      <nav className="legal-page-links" aria-label="Policy navigation">
        <a href="/terms-and-conditions">View Terms and Conditions</a>
        <a href="/events">Back to Events</a>
      </nav>
    </section>
  );
}
