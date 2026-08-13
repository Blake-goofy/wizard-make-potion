export default function AboutPage() {
  return (
    <section className="content-panel legal-page about-page">
      <div className="legal-page-header">
        <p className="eyebrow">About</p>
        <h1>Wizard Make Potion</h1>
        <p className="status-text">
          Wizard Make Potion is an informal group of friends who organize and host local events in Edmond, Oklahoma.
          We are not an incorporated or registered company.
        </p>
      </div>

      <div className="legal-copy">
        <section>
          <h2>What We Do</h2>
          <p>
            We create and host small themed events for our community. This website publishes event details, sells admission
            tickets, emails purchase confirmations, and provides digital tickets for entry.
          </p>
        </section>

        <section>
          <h2>Contact and Location</h2>
          <address className="about-contact-list">
            <span>Wizard Make Potion</span>
            <span>328 E 14th St, Edmond, OK 73034</span>
            <a href="tel:+14058338435">+1 (405) 833-8435</a>
            <a href="mailto:info@wizardmakepotion.com">info@wizardmakepotion.com</a>
          </address>
        </section>

        <section>
          <h2>Optional Event Text Messages</h2>
          <p>
            Customers may optionally agree to receive event reminders and upcoming event announcements by SMS from Wizard
            Make Potion. SMS consent is not required to create an account or purchase tickets.
          </p>
          <p>
            To use the account opt-in form, open Create Account, enter an optional phone number, check the SMS consent box,
            and submit the form. For guest checkout, open Events, choose an event, select Continue as guest, and use the SMS
            consent field on the checkout form. Both consent boxes are unchecked by default.
          </p>
        </section>
      </div>

      <nav className="legal-page-links" aria-label="About page links">
        <a href="/create-account">View Account Opt-In Form</a>
        <a href="/events">Browse Events</a>
        <a href="/privacy-policy">Privacy Policy</a>
        <a href="/terms-and-conditions">Terms and Conditions</a>
      </nav>
    </section>
  );
}
