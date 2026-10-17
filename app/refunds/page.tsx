import { BUSINESS } from "@/lib/business";

export const metadata = { title: "Cancellation & refunds" };

export default function Refunds() {
  return (
    <div className="prose-job mx-auto max-w-3xl px-4 pt-8">
      <h1 className="t-h1">Cancellation &amp; refund policy</h1>
      <p><em>Have this page reviewed before launch. It must match how you actually handle refunds; Razorpay checks it during account activation.</em></p>
      <h2>Subscriptions</h2>
      <ul>
        <li>Mana Kosamu Jobs is a digital subscription. Plans renew automatically (UPI AutoPay / card mandate) until you cancel.</li>
        <li>You can turn off auto-renewal any time from the <a href="/subscribe">Subscribe</a> page. You keep access until the end of the period you have paid for; no further payments are taken.</li>
        <li>New accounts get a free trial (if offered). You are not charged during the trial.</li>
      </ul>
      <h2>Refunds</h2>
      <ul>
        <li>If you were charged twice or charged after cancelling, contact us within 7 days and we will refund the extra amount in full.</li>
        <li>If the service was unavailable for a significant part of your paid period, contact us and we will refund the unused part.</li>
        <li>Approved refunds go back to the original payment method within 5–7 working days.</li>
      </ul>
      <h2>One device per account</h2>
      <p>A subscription works on one registered device. You can move it to a new device yourself once every 30 days, or contact us for help sooner.</p>
      <h2>Contact</h2>
      <p>{BUSINESS.name} · <a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a> · {BUSINESS.phone}</p>
    </div>
  );
}
