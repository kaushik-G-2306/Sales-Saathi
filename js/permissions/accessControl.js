import { PlanPackages } from './plans.js';
import { getFeature } from './features.js';

/**
 * Checks if the user's current plan has access to the requested feature.
 * @param {string} featureId - The ID of the feature (e.g. 'shared-workspaces')
 * @param {string} currentPlanId - The user's current plan (e.g. 'free', 'pro', 'team', 'enterprise')
 * @returns {boolean} - true if access is allowed, false if locked
 */
export function canAccess(featureId, currentPlanId) {
    const feature = getFeature(featureId);
    if (!feature) {
        console.warn(`Feature ${featureId} not found in configuration.`);
        return false; // Fail secure
    }

    const plan = (currentPlanId || 'free').toLowerCase();
    const packageFeatures = PlanPackages[plan];

    if (!packageFeatures) return false;
    return packageFeatures.has(featureId);
}

/**
 * Handles feature clicks by either executing a callback or showing the upgrade modal.
 * @param {string} featureId 
 * @param {string} currentPlanId 
 * @param {Function} onAllowed 
 */
export function handleFeatureClick(featureId, currentPlanId, onAllowed) {
    if (canAccess(featureId, currentPlanId)) {
        if (typeof onAllowed === 'function') onAllowed();
    } else {
        const feature = getFeature(featureId);
        if (window.Alpine && window.Alpine.store('upgradeModal')) {
            window.Alpine.store('upgradeModal').open(feature.name, feature.requiredPlan);
        } else {
            // Fallback redirect if modal isn't initialized
            window.location.href = `/pricing.html?upgrade_from=${currentPlanId}&feature=${featureId}`;
        }
    }
}
