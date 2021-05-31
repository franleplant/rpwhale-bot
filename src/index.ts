import { Probot } from "probot";

export = (app: Probot) => {
  //app.onAny(async context => {
  //console.log(context.name, context.id)
  //context.ok
  ////console.log("received something", event)
  //})

  app.on("workflow_run", async (context) => {
    console.log("start");
    const featureRequests = await context.octokit.issues.listForRepo({
      repo: "rpwhale-bot",
      owner: "franleplant",
      labels: "feature",
    });

    const feat = featureRequests.data[0];
    const id = feat.number;

    try {
      const comments = await context.octokit.issues.listComments({
        repo: "rpwhale-bot",
        owner: "franleplant",
        issue_number: id,
      });
      console.log(JSON.stringify(comments, null, 2));

      const comment = comments.data.find(
        (comment) => comment.user?.login === "rpwhale-bot-v2[bot]"
      );
      if (!comment) {
        throw new Error();
      }

      await context.octokit.issues.updateComment({
        repo: "rpwhale-bot",
        owner: "franleplant",
        body:
          "This feature requests has 10 donations totaling 1000 wax to sponsor it" +
          new Date().toISOString(),
        comment_id: comment.id,
      });
    } catch (err) {
      await context.octokit.issues.createComment({
        repo: "rpwhale-bot",
        owner: "franleplant",
        issue_number: id,
        body: "This feature requests has 10 donations totaling 1000 wax to sponsor it",
      });
    }

    //featureRequests.data.forEach(feat => {
    //const id = feat.number
    //})
  });

  app.on("issues.opened", async (context) => {
    const issueComment = context.issue({
      body: "Thanks for opening this issue!",
    });
    await context.octokit.issues.createComment(issueComment);
  });
  // For more information on building apps:
  // https://probot.github.io/docs/

  // To get your app running against GitHub, see:
  // https://probot.github.io/docs/development/
};
