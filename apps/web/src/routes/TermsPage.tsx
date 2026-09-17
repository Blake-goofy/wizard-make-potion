export default function TermsPage() {
  return (
    <section className="content-panel legal-page">
      <div className="legal-page-header">
        <p className="eyebrow">Legal</p>
        <h1>Terms and Conditions</h1>
        <p className="status-text">
          These terms apply to website use, ticket purchases, accounts, and optional SMS messaging from Wizard Make Potion.
        </p>
      </div>

      <div className="legal-copy">
        <section>
          <h2>Event Operator</h2>
          <p>
            Wizard Make Potion is a local event series organized and operated by Blake Becker. It is not a separate
            corporation or LLC.
          </p>
        </section>

        <section>
          <h2>Ticketing Services</h2>
          <p>
            We rent venues in the Edmond and Oklahoma City area and host ticketed social events featuring DJ music. Some
            events have a theme, and costumes may be encouraged. Our website lets customers browse these events, create
            accounts, purchase admission tickets, and manage order information.
          </p>
        </section>

        <section>
          <h2>SMS Program Description</h2>
          <p>
            If you choose to opt in, you may receive SMS messages related to the events you purchase tickets for, including
            reminders, and you may also receive optional updates about new events and ticket releases.
          </p>
        </section>

        <section>
          <h2>SMS Consent</h2>
          <p>
            SMS consent is not a condition of purchase. You can buy tickets without agreeing to receive text messages.
          </p>
        </section>

        <section>
          <h2>Message Frequency and Fees</h2>
          <p>
            Message frequency varies based on your activity, purchases, and selected notification preferences. Message and data
            rates may apply.
          </p>
        </section>

        <section>
          <h2>Opt-Out and Help</h2>
          <p>
            You can opt out of SMS at any time by replying STOP to any message. You can reply HELP for assistance.
          </p>
        </section>

        <section>
          <h2>Privacy</h2>
          <p>
            Your use of our SMS program and website is also subject to our Privacy Policy, including the statement that your
            mobile information will not be sold or shared with third parties for promotional or marketing purposes.
          </p>
        </section>
      </div>

      <nav className="legal-page-links" aria-label="Policy navigation">
        <a href="/privacy-policy">View Privacy Policy</a>
        <a href="/events">Back to Events</a>
      </nav>
    </section>
  );
}
