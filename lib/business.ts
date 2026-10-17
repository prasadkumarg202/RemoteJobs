// Business details shown on Contact / Refunds pages (required by Razorpay for activation).
// Set these in .env.local; the placeholders make missing values obvious.
export const BUSINESS = {
  name: process.env.NEXT_PUBLIC_BUSINESS_NAME ?? "[Set NEXT_PUBLIC_BUSINESS_NAME]",
  email: process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@example.com",
  phone: process.env.NEXT_PUBLIC_SUPPORT_PHONE ?? "[Set NEXT_PUBLIC_SUPPORT_PHONE]",
  address: process.env.NEXT_PUBLIC_BUSINESS_ADDRESS ?? "[Set NEXT_PUBLIC_BUSINESS_ADDRESS]",
};
