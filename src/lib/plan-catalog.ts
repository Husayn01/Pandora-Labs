export type PublicPlan = {
  code: 'free' | 'solo' | 'business' | 'scale';
  name: string;
  monthlyPriceMinor: number;
  pricePrefix?: string;
  seatLimit: number | null;
  actionCredits: number | null;
  webVoiceMinutes: number | null;
  auditDays: number | null;
  features: string[];
};

export const launchPlanCatalog: PublicPlan[] = [
  { code: 'free', name: 'Free', monthlyPriceMinor: 0, seatLimit: 1, actionCredits: 100, webVoiceMinutes: 15, auditDays: 7, features: ['One Google connection', 'Tasks and reminders', 'One-time 5-minute phone trial'] },
  { code: 'solo', name: 'Solo', monthlyPriceMinor: 2_000_000, seatLimit: 3, actionCredits: 750, webVoiceMinutes: 100, auditDays: 30, features: ['Email and calendar actions', 'Invoice drafts', 'Reports and prepaid phone access'] },
  { code: 'business', name: 'Business', monthlyPriceMinor: 6_000_000, seatLimit: 10, actionCredits: 3_000, webVoiceMinutes: 500, auditDays: 90, features: ['Multi-inbox and calendar', 'Approval policies', 'Advanced reports and number eligibility'] },
  { code: 'scale', name: 'Scale', monthlyPriceMinor: 20_000_000, pricePrefix: 'From', seatLimit: null, actionCredits: null, webVoiceMinutes: null, auditDays: null, features: ['Custom capacity and retention', 'Dedicated number or SIP', 'Onboarding, support, and SLA'] },
];
