import { IDonation, IDonationSummary } from "./donations";

const DONATIONS_CACHE_START = `
<!--

\`\`\`json
`;

const DONATIONS_CACHE_END = `
\`\`\`

-->
`;

export function getDonationsFromBody(body: string): Array<IDonation> {
  try {
    const fromStart = body.split(DONATIONS_CACHE_START.trim())[1];
    const cache = fromStart.split(DONATIONS_CACHE_END.trim())[0];
    const donations = JSON.parse(cache);
    console.log("extracted donations from body", donations);
    return donations;
  } catch (err) {
    console.warn("error extracting donations from body", err);
    return [];
  }
}

export function renderDonations(donations?: IDonationSummary): string {
  return `
**Feature Bounty**

${renderDonationsSummary(donations)}

[Place a bounty](https://www.rpwhale.online) to get this feature done!
Higher bounty features get done first and faster.

${DONATIONS_CACHE_START}
${JSON.stringify(donations || [])}
${DONATIONS_CACHE_END}

  `;
}

export function renderDonationsSummary(donations?: IDonationSummary): string {
  if (!donations) {
    return "";
  }

  return `
- ${donations.donations.length} donations totaling **${donations.wax} wax**

Donators:

${donations.donations
  .map(({ from, wax }) => `- ${from} donated ${wax} wax`)
  .join("\n")}
`;
}
