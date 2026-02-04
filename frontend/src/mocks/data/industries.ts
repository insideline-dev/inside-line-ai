export interface Industry {
  value: string;
  label: string;
  group: string;
}

export interface IndustryGroup {
  value: string;
  label: string;
  industries: Industry[];
}

export const industryGroups: IndustryGroup[] = [
  {
    value: "advertising",
    label: "Advertising",
    industries: [
      { value: "ad_exchange", label: "Ad Exchange", group: "advertising" },
      { value: "ad_network", label: "Ad Network", group: "advertising" },
      { value: "digital_advertising", label: "Digital Advertising", group: "advertising" },
      { value: "mobile_advertising", label: "Mobile Advertising", group: "advertising" },
      { value: "advertising_other", label: "Other", group: "advertising" },
    ],
  },
  {
    value: "artificial_intelligence",
    label: "Artificial Intelligence",
    industries: [
      { value: "ai_assistants", label: "AI Assistants", group: "artificial_intelligence" },
      { value: "computer_vision", label: "Computer Vision", group: "artificial_intelligence" },
      { value: "generative_ai", label: "Generative AI", group: "artificial_intelligence" },
      { value: "machine_learning", label: "Machine Learning", group: "artificial_intelligence" },
      { value: "natural_language_processing", label: "Natural Language Processing", group: "artificial_intelligence" },
      { value: "artificial_intelligence_other", label: "Other", group: "artificial_intelligence" },
    ],
  },
  {
    value: "biotechnology",
    label: "Biotechnology",
    industries: [
      { value: "bioinformatics", label: "Bioinformatics", group: "biotechnology" },
      { value: "biopharma", label: "Biopharma", group: "biotechnology" },
      { value: "genetics", label: "Genetics", group: "biotechnology" },
      { value: "life_sciences", label: "Life Sciences", group: "biotechnology" },
      { value: "biotechnology_other", label: "Other", group: "biotechnology" },
    ],
  },
  {
    value: "commerce_shopping",
    label: "Commerce and Shopping",
    industries: [
      { value: "ecommerce", label: "E-Commerce", group: "commerce_shopping" },
      { value: "marketplace", label: "Marketplace", group: "commerce_shopping" },
      { value: "retail", label: "Retail", group: "commerce_shopping" },
      { value: "retail_tech", label: "Retail Tech", group: "commerce_shopping" },
      { value: "commerce_shopping_other", label: "Other", group: "commerce_shopping" },
    ],
  },
  {
    value: "data_analytics",
    label: "Data and Analytics",
    industries: [
      { value: "analytics", label: "Analytics", group: "data_analytics" },
      { value: "big_data", label: "Big Data", group: "data_analytics" },
      { value: "business_intelligence", label: "Business Intelligence", group: "data_analytics" },
      { value: "data_visualization", label: "Data Visualization", group: "data_analytics" },
      { value: "data_analytics_other", label: "Other", group: "data_analytics" },
    ],
  },
  {
    value: "education",
    label: "Education",
    industries: [
      { value: "edtech", label: "EdTech", group: "education" },
      { value: "elearning", label: "E-Learning", group: "education" },
      { value: "corporate_training", label: "Corporate Training", group: "education" },
      { value: "education_other", label: "Other", group: "education" },
    ],
  },
  {
    value: "financial_services",
    label: "Financial Services",
    industries: [
      { value: "fintech", label: "FinTech", group: "financial_services" },
      { value: "banking", label: "Banking", group: "financial_services" },
      { value: "insurance", label: "Insurance", group: "financial_services" },
      { value: "insurtech", label: "InsurTech", group: "financial_services" },
      { value: "wealth_management", label: "Wealth Management", group: "financial_services" },
      { value: "financial_services_other", label: "Other", group: "financial_services" },
    ],
  },
  {
    value: "health_care",
    label: "Health Care",
    industries: [
      { value: "healthtech", label: "HealthTech", group: "health_care" },
      { value: "telemedicine", label: "Telemedicine", group: "health_care" },
      { value: "medical_device", label: "Medical Device", group: "health_care" },
      { value: "mental_health", label: "Mental Health", group: "health_care" },
      { value: "health_care_other", label: "Other", group: "health_care" },
    ],
  },
  {
    value: "security",
    label: "Security",
    industries: [
      { value: "cyber_security", label: "Cyber Security", group: "security" },
      { value: "fraud_detection", label: "Fraud Detection", group: "security" },
      { value: "identity_management", label: "Identity Management", group: "security" },
      { value: "security_other", label: "Other", group: "security" },
    ],
  },
  {
    value: "software",
    label: "Software",
    industries: [
      { value: "saas", label: "SaaS", group: "software" },
      { value: "enterprise_software", label: "Enterprise Software", group: "software" },
      { value: "developer_tools", label: "Developer Tools", group: "software" },
      { value: "cloud_computing", label: "Cloud Computing", group: "software" },
      { value: "devops", label: "DevOps", group: "software" },
      { value: "software_other", label: "Other", group: "software" },
    ],
  },
  {
    value: "sustainability",
    label: "Sustainability",
    industries: [
      { value: "climate_tech", label: "Climate Tech", group: "sustainability" },
      { value: "cleantech", label: "CleanTech", group: "sustainability" },
      { value: "renewable_energy", label: "Renewable Energy", group: "sustainability" },
      { value: "sustainability_other", label: "Other", group: "sustainability" },
    ],
  },
  {
    value: "transportation",
    label: "Transportation",
    industries: [
      { value: "logistics", label: "Logistics", group: "transportation" },
      { value: "supply_chain", label: "Supply Chain", group: "transportation" },
      { value: "autonomous_vehicles", label: "Autonomous Vehicles", group: "transportation" },
      { value: "transportation_other", label: "Other", group: "transportation" },
    ],
  },
  {
    value: "other",
    label: "Other",
    industries: [
      { value: "other_industry", label: "Other", group: "other" },
    ],
  },
];

export const flatIndustries: Industry[] = industryGroups.flatMap((group) => group.industries);

export function getIndustryLabel(value: string): string {
  const industry = flatIndustries.find((i) => i.value === value);
  return industry?.label || value;
}

export function getIndustryGroupLabel(value: string): string {
  const group = industryGroups.find((g) => g.value === value);
  return group?.label || value;
}
