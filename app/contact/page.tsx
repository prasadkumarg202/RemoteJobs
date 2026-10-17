import { BUSINESS } from "@/lib/business";

export const metadata = { title: "Contact us" };

export default function Contact() {
  return (
    <div className="prose-job mx-auto max-w-3xl px-4 pt-8">
      <h1 className="t-h1">Contact us</h1>
      <p>Questions about your subscription, payments, moving to a new device, or a job listing? Reach us here — we reply within one working day.</p>
      <ul>
        <li><strong>Business:</strong> {BUSINESS.name}</li>
        <li><strong>Email:</strong> <a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a></li>
        <li><strong>Phone / WhatsApp:</strong> {BUSINESS.phone}</li>
        <li><strong>Address:</strong> {BUSINESS.address}</li>
      </ul>
      <p>To report a suspicious job, use “Report this job” on the job page.</p>
    </div>
  );
}
