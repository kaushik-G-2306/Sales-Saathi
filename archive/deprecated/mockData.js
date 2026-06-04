export const mockData = {
  preMeetingBriefs: [
    {
      id: "brief-001",
      company: "Acme Corp",
      stakeholder: "Jane Doe (VP of Sales)",
      keyInsights: [
        "Recent funding round of $50M Series B.",
        "Currently using HubSpot, looking for deeper AI integration.",
        "Q3 goal is to increase outbound pipeline by 30%."
      ],
      suggestedTopics: ["How Sales Saathi integrates with HubSpot", "Automating outbound sequences"]
    },
    {
      id: "brief-002",
      company: "TechNova",
      stakeholder: "John Smith (CRO)",
      keyInsights: [
        "Expanding to EMEA market next month.",
        "Struggling with deal slipping in late stages.",
        "Competitor contract expires in 60 days."
      ],
      suggestedTopics: ["Pipeline Analytics for EMEA", "Deal Risk Predictor demonstration"]
    }
  ],
  smartIceBreakers: [
    { target: "Jane Doe", prompt: "I saw Acme Corp just raised a $50M Series B—congratulations! How is the team prioritizing that capital for the sales org?" },
    { target: "John Smith", prompt: "Noticed TechNova's recent push into EMEA on LinkedIn. Are you finding different deal dynamics there compared to NA?" }
  ],
  meetingSummaries: [
    {
      meetingId: "mtg-101",
      date: "2023-10-25",
      participants: ["Alex Rivera", "Jane Doe"],
      summary: "Jane is highly interested in the HubSpot integration. They have budget approval for Q4. Main objection is implementation time.",
      actionItems: ["Send implementation timeline.", "Schedule technical deep dive with Acme IT."]
    }
  ],
  dealRisk: [
    { dealName: "Acme Corp - Enterprise Rollout", value: "$120,000", riskLevel: "Low", factors: ["VP Level Engagement", "Budget Approved"] },
    { dealName: "TechNova - EMEA Expansion", value: "$85,000", riskLevel: "High", factors: ["No clear decision maker", "Stalled for 14 days"] }
  ],
  pipelineAnalytics: {
    totalPipeline: "$2.4M",
    weightedPipeline: "$1.1M",
    winRate: "32%",
    avgDealSize: "$45,000",
    salesCycle: "42 days"
  }
};
