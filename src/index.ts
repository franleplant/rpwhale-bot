/// <reference path='./declarations.d.ts' />
import "dotenv/config";
import * as aws from "aws-lambda";
import { Probot } from "probot";
import {
  createLambdaFunction,
  createProbot,
} from "@probot/adapter-aws-lambda-serverless";
import * as Donations from "./donations";
import { renderDonations, getDonationsFromBody } from "./renderComment";

const REPO = process.env.REPO || "";
const OWNER = process.env.OWNER || "";
const BOT_USER = process.env.BOT_USER || "";

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

    let donations: Donations.IDonationSummaryMap;
    try {
      donations = await Donations.fetchDonations();
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

        const cachedDonations = getDonationsFromBody(comment.body || "");
        const newDonations = donations[id]?.donations || []
        const summary = Donations.calcDonationsSummary(id, [
          ...newDonations,
          ...cachedDonations,
        ]);

        console.log("updating comment");
        return context.octokit.issues.updateComment({
          repo: REPO,
          owner: OWNER,
          body: renderDonations(summary),
          comment_id: comment.id,
        });
      } catch (err) {
        console.log("creating comment, because", err);
        return context.octokit.issues.createComment({
          repo: REPO,
          owner: OWNER,
          issue_number: id,
          body: renderDonations(),
        });
      }
    });

    console.log("awaiting all tasks for each featureRequest");
    try {
      const res = await Promise.all(tasks);
      console.log("done!", res);
    } catch (err) {
      console.error("general error", err);
    }
  });

  app.on("issues.opened", async (context) => {
    const issueComment = context.issue({
      body: renderDonations(),
    });
    await context.octokit.issues.createComment(issueComment);
  });
  // For more information on building apps:
  // https://probot.github.io/docs/

  // To get your app running against GitHub, see:
  // https://probot.github.io/docs/development/
}

export const lambdaHandler: aws.Handler = createLambdaFunction(rpWhaleBot, {
  probot: createProbot(),
});
