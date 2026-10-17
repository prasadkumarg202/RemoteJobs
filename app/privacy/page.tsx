export const metadata = { title: "Privacy for jobs" };
export default function Privacy() {
  return (
    <div className="prose-job mx-auto max-w-3xl px-4 pt-8">
      <h1 className="t-h1">Privacy for jobs</h1>
      <p>Replace this page with Mana Kosamu’s reviewed privacy policy before launch. What the jobs module stores:</p>
      <ul>
        <li>Saved jobs, hidden jobs and job alerts for signed-in users.</li>
        <li>Usage events (job viewed, apply clicked, searches) linked to a random session id. No IP address or device fingerprint is stored. Raw events are deleted after 180 days.</li>
        <li>Employer contact numbers are visible only to the review team.</li>
        <li>When you search, the “More jobs from Careerjet” box sends your search words, the place, your IP address and browser type to Careerjet so it can show live results (Careerjet requires this). Mana Kosamu does not store these results.</li>
        <li>Subscription payments are handled by Razorpay; we keep the plan, dates and Razorpay ids, never card or UPI details.</li>
      </ul>
    </div>
  );
}
