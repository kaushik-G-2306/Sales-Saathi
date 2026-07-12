export const PlanTiers = {
    free: { name: 'Free', color: 'bg-emerald-500' },
    pro: { name: 'Pro', color: 'bg-brandViolet' },
    team: { name: 'Team', color: 'bg-blue-500' },
    enterprise: { name: 'Enterprise', color: 'bg-amber-500' }
};

// Each plan defines the EXACT set of features it unlocks
export const PlanPackages = {
  free:       new Set(['dashboard','meetings','briefs','outreach']),
  pro:        new Set(['dashboard','meetings','briefs','outreach','pipelines',
                       'relationship-intelligence','priority-sync-queues', 'advanced-outreach']),
  team:       new Set(['dashboard','meetings','briefs','outreach','pipelines',
                       'shared-workspaces','deal-risk-tracking',
                       'manager-dashboards','slack-notifications', 'team-analytics']),
  enterprise: new Set(['dashboard','meetings','briefs','outreach','pipelines',
                       'custom-ai-models','advanced-security-controls',
                       'enterprise-admin','sso-saml','audit-logs','white-glove-onboarding'])
};

export function getPlanConfig(planId) {
    if (!planId || !PlanTiers[planId.toLowerCase()]) return PlanTiers.free;
    return PlanTiers[planId.toLowerCase()];
}
