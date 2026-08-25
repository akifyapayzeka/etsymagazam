import { createLogger } from "@etsymagazam/core";
import { scoreKeywordOpportunity } from "../agents/trend-scout.js";

const log = createLogger("job:research");

export async function handleScoreManualKeywords(data: { keywordIds: string[] }): Promise<void> {
  for (const keywordId of data.keywordIds) {
    try {
      await scoreKeywordOpportunity(keywordId);
    } catch (err) {
      log.error({ err, keywordId }, "Failed to score keyword");
    }
  }
}
