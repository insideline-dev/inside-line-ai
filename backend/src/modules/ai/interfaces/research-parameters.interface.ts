export interface ResearchParameters {
  companyName: string;
  sector: string;
  specificMarket: string;
  productDescription: string;
  targetCustomers: string;
  knownCompetitors: string[];
  geographicFocus: string;
  businessModel: string;
  fundingStage: string;
  teamMembers: Array<{ name: string; role: string; linkedinUrl?: string; highlights?: string }>;
  claimedMetrics: { tam?: string; growthRate?: string; revenue?: string; customers?: string };
}
