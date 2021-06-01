import { getRpc } from "./waxApi";

const DONATIONS_ACCOUNT = process.env.DONATIONS_ACCOUNT || "";

export interface IDonationSummaryMap {
  [featureId: number]: IDonationSummary;
}

export interface IDonationSummary {
  featureId: number;
  wax: number;
  donations: Array<IDonation>;
}

export interface IDonation {
  date: string;
  trxId: string;
  from: string;
  wax: number;
}

export function calcDonationsSummary(
  featureId: number,
  dupedDonations: Array<IDonation>
): IDonationSummary {
  const donations = dedupDonations(dupedDonations);
  const wax = donations.reduce((total, don) => total + don.wax, 0);

  return {
    featureId,
    wax,
    donations,
  };
}

export function dedupDonations(donations: Array<IDonation>): Array<IDonation> {
  console.log("dedupDonations input", donations)
  // let's unify the cached donations and the potentially new
  // donations by using a simple map
  const map = new Map<string, IDonation>();

  for (const don of donations) {
    // im not sure about the unicisity of the transaction id
    // so I am using the account from where we received the donation too
    const key = `${don.trxId}-${don.from}`;
    map.set(key, don);
  }

  const res = Array.from(map.values());
  console.log("dedupDonations output", res)
  return res
}

export async function fetchDonations(): Promise<IDonationSummaryMap> {
  const rpc = getRpc();

  const actions = await rpc.history_get_actions(DONATIONS_ACCOUNT);

  const featMap: { [featureId: number]: Array<IDonation> } = {};

  for (const action of actions.actions) {
    const data: any = action.action_trace?.act?.data;
    const account: string = action.action_trace?.act?.account || "";
    const name: string = action.action_trace?.act?.name || "";
    const memo: string = data?.memo || "";
    const trxId: string = action.action_trace?.trx_id || "";
    const date: string = action.block_time || "";
    // skip transactions that don't have the special memo,
    // and transactions that are anything else besides sending wax
    if (
      !(
        memo.includes("____feature") &&
        account === "eosio.token" &&
        name === "transfer"
      )
    ) {
      continue;
    }

    const from: string = data?.from || "";
    const quantityStr: string = data?.quantity || "";

    let wax = 0;
    if (quantityStr.includes("WAX")) {
      wax = Number(quantityStr.split(" ")[0] || 0);
    }

    let featureId: number | undefined;
    try {
      featureId = Number(memo.split(":")[1]);
    } catch (err) {
      console.warn(`error inferring feature id out of memo ${memo}`, err);
    }

    if (!featureId) {
      continue;
    }

    if (!featMap[featureId]) {
      featMap[featureId] = [];
    }

    featMap[featureId].push({ from, wax, trxId, date });
  }

  const summaryMap: IDonationSummaryMap = {};

  for (const [featureId, donations] of Object.entries(featMap)) {
    summaryMap[Number(featureId)] = calcDonationsSummary(
      Number(featureId),
      donations
    );
  }

  return summaryMap;
}
