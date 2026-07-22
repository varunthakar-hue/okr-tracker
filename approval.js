import { postApprovalCard, pollForDecision, postError } from '../lib/slack.js';

export async function runApproval(event, content) {
  console.log(`[Approval] Posting to Slack for ${event.company}…`);

  let messageTs;
  try {
    messageTs = await postApprovalCard(event, content);
  } catch (err) {
    await postError(`Failed to post approval card for ${event.company}`, err.message);
    throw err;
  }

  console.log(`[Approval] Waiting for CM decision on message ${messageTs}…`);

  try {
    const decision = await pollForDecision(messageTs);
    console.log(`[Approval] Decision: ${decision.decision} by ${decision.approved_by}`);
    return decision;
  } catch (err) {
    await postError(`Approval timeout for ${event.company} (event: ${event.event_id})`, err.message);
    throw err;
  }
}
