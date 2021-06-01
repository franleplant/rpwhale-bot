/// <reference path='./declarations.d.ts' />
import "dotenv/config";
import * as aws from "aws-lambda";
import { Probot } from "probot";
import {
  createLambdaFunction,
  createProbot,
} from "@probot/adapter-aws-lambda-serverless";
import { JsonRpc } from "eosjs";
import fetch from "node-fetch";

const REPO = process.env.REPO || "";
const OWNER = process.env.OWNER || "";
const BOT_USER = process.env.BOT_USER || "";
const DONATIONS_ACCOUNT = process.env.DONATIONS_ACCOUNT || "";

export default function rpWhaleBot(app: Probot) {
  app.on("workflow_run", async (context) => {
    console.log("workflow run");

    const featureRequests = await context.octokit.issues.listForRepo({
      repo: REPO,
      owner: OWNER,
      labels: "feature",
    });

    console.log("got feature requests", featureRequests.data);

    console.log(
      "feature requests, is there more?",
      featureRequests.headers.link
    );

    let donations: { [featureId: number]: IFeatureDonations };
    try {
      donations = await getDonations();
      console.log(`got donations`, donations);
    } catch (err) {
      console.log(`error getting donations`, err);
      throw new Error(`error talking to eos`);
    }

    const tasks = featureRequests.data.map(async (feat) => {
      const id = feat.number;

      try {
        const comments = await context.octokit.issues.listComments({
          repo: REPO,
          owner: OWNER,
          issue_number: id,
        });

        console.log(`found ${comments.data.length} comments in issue ${id}`);

        const comment = comments.data.find(
          (comment) => comment.user?.login === BOT_USER
        );

        if (!comment) {
          throw new Error(`no bot comment yet`);
        }

        console.log("updating comment");
        return context.octokit.issues.updateComment({
          repo: REPO,
          owner: OWNER,
          body: getDonationsBody(donations[id]),
          comment_id: comment.id,
        });
      } catch (err) {
        console.log("creating comment, because", err);
        return context.octokit.issues.createComment({
          repo: REPO,
          owner: OWNER,
          issue_number: id,
          body: getDonationsBody(),
        });
      }
    });

    console.log("awaiting all tasks for each featureRequest")
    try {
    const res = await Promise.all(tasks);
    console.log("done!", res);
    } catch (err) {
      console.error("general error", err)
    }
  });

  app.on("issues.opened", async (context) => {
    const issueComment = context.issue({
      body: getDonationsBody(),
    });
    await context.octokit.issues.createComment(issueComment);
  });
  // For more information on building apps:
  // https://probot.github.io/docs/

  // To get your app running against GitHub, see:
  // https://probot.github.io/docs/development/
}

export function getDonationsBody(donations?: IFeatureDonations): string {
  return `
**Feature Bounty**

${getDonationsSummary(donations)}

[Place a bounty](https://www.rpwhale.online) to get this feature done!
Higher bounty features get done first and faster.
  `;
}

export function getDonationsSummary(donations?: IFeatureDonations): string {
  if (!donations) {
    return "";
  }

  return `
- ${donations.donations.length} donations totaling **${donations.wax} wax**

Donators:

${donations.donations.map(({ from, wax }) => `- ${from} donated ${wax} wax`)}
`;
}

let _rpc: JsonRpc | undefined;
export function getRpc(): JsonRpc {
  if (!_rpc) {
    _rpc = new JsonRpc("https://wax.greymass.com", { fetch });
  }

  return _rpc;
}

export interface IFeatureDonations {
  featureId: number;
  wax: number;
  donations: Array<IDonation>;
}

export interface IDonation {
  from: string;
  wax: number;
}

// TODO deal with more than one page
export async function getDonations(): Promise<{
  [featureId: number]: IFeatureDonations;
}> {
  const rpc = getRpc();

  const actions = await rpc.history_get_actions(DONATIONS_ACCOUNT);

  const featMap: { [featureId: number]: Array<IDonation> } = {};

  for (const action of actions.actions) {
    const data: any = action.action_trace?.act?.data;
    const account: string = action.action_trace?.act?.account || "";
    const name: string = action.action_trace?.act?.name || "";
    const memo: string = data?.memo || "";
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

    featMap[featureId].push({ from, wax });
  }

  const featureDonations: { [featureId: number]: IFeatureDonations } = {};
  for (const [featureId, donations] of Object.entries(featMap)) {
    const wax = donations.reduce((total, donation) => total + donation.wax, 0);

    featureDonations[Number(featureId)] = {
      featureId: Number(featureId),
      wax,
      donations,
    };
  }

  return featureDonations;
}

export const lambdaHandler: aws.Handler = createLambdaFunction(rpWhaleBot, {
  probot: createProbot(),
});
