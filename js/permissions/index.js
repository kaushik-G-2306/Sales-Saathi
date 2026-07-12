import { canAccess, handleFeatureClick } from './accessControl.js';
import { Features, SidebarFeatures, getFeature } from './features.js';
import { PlanTiers, PlanPackages } from './plans.js';
import { SubscriptionService } from './subscriptionService.js';

window.AppPermissions = {
    canAccess,
    handleFeatureClick,
    Features,
    SidebarFeatures,
    getFeature,
    PlanTiers,
    PlanPackages,
    SubscriptionService
};
