/** Extracted course data from Python service */
export interface ExtractedData {
  sourceUrl: string;
  title: string | null;
  label: string;
  summaryBullets: string[];
  keyBenefits: string[];
  contentSections: { heading: string; bullets: string[] }[];
  facts: {
    price: number | null;
    studyLoadHours: number | null;
    availabilityPeriod: string | null;
    locationsCount: number | null;
  };
  disclaimers: string[];
}

export type TemplateType =
  | "lead-magnet"   // 2 pages
  | "product-deep-dive"  // 4 pages
  | "update-explainer";  // 3 pages

export interface LayoutSpecSection {
  id: string;
  title: string;
  recommendedImagery: string;
  iconSuggestion: string;
  callout?: string;
}

export interface LayoutSpec {
  sectionOrder: string[];
  sections: LayoutSpecSection[];
}
