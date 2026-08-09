import type { BusinessConfig } from "../types";

/**
 * EXAMPLE TENANT.
 *
 * This is what a real client config looks like. To onboard a new business, copy
 * this file, rename it, and edit the fields — mostly `knowledge`. The made-up
 * details below are placeholders.
 */
export const sunshinePreschool: BusinessConfig = {
  id: "sunshine-preschool",
  displayName: "Sunshine Preschool",

  // Filled in with the real Meta phone number ID once the client's WhatsApp
  // number is connected. Placeholder for now.
  whatsappPhoneNumberId: "1306957939157417",

  languages: ["English", "Hindi"],

  // The facts sheet — the ONLY thing the bot may answer from. Written as simple
  // markdown so it's easy for a non-technical person to review/edit.
  knowledge: `
# Sunshine Preschool — Facts

## About
Sunshine Preschool is a play-based preschool for children aged 1.5 to 5 years.
We focus on early learning through play, in small groups.

## Programs & ages
- Playgroup: 1.5–2.5 years
- Nursery: 2.5–3.5 years
- LKG: 3.5–4.5 years
- UKG: 4.5–5.5 years

## Timings
- Monday to Friday, 9:00 AM to 12:30 PM
- Saturday and Sunday closed

## Fees
- Admission fee (one-time): ₹5,000
- Monthly fee: ₹4,000 per month
- Fees are payable monthly, in the first week of each month.

## Location
123 Garden Road, Green Park, Pune 411001.
Landmark: opposite the community park.

## Admissions
- Admissions are open throughout the year, subject to seats.
- To join: parents visit the school, fill an enquiry, and book a spot.
- Documents needed: child's birth certificate and 2 photos.

## Contact
For anything not covered here, our team will call the parent back.
`.trim(),

  fallbackMessage:
    "That's a great question — I'm not fully sure about that one, so I'll have someone from Sunshine Preschool call you back. Could you share your name?",

  // The Google Sheet ID for this client's leads. Placeholder until we set up
  // Google Sheets in a later step.
  leadSheetId: "17RZ0zTuq3OZDraVwd8rZnbYXt7LjhkZReHnos4Q1TOo",

  // Owner's email for booking alerts. In Resend TEST mode this must be the email
  // you signed up to Resend with. Replace with the real owner's email per client.
  ownerEmail: "origin200626@gmail.com",
};
