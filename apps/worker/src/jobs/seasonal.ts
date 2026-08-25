import { scanSeasonalOpportunities } from "../agents/seasonal.js";

export async function handleScanSeasonal(): Promise<void> {
  await scanSeasonalOpportunities();
}
