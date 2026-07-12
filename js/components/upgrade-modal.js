// js/components/upgrade-modal.js

// Make sure Alpine is available before initializing
document.addEventListener('alpine:init', () => {
    Alpine.store('upgradeModal', {
        isOpen: false,
        featureName: '',
        requiredPlan: '',
        currentPlan: '',
        benefits: [],

        open(featureName, requiredPlan) {
            this.featureName = featureName;
            this.requiredPlan = requiredPlan;
            
            // Fetch current plan from localStorage if available, else default to free
            try {
                this.currentPlan = JSON.parse(localStorage.getItem('_x_userPlan')) || 'free';
            } catch (e) {
                this.currentPlan = 'free';
            }

            // Determine benefits based on required plan
            // Determine benefits based on required plan package
            if (requiredPlan === 'pro') {
                this.benefits = [
                    'Relationship Intelligence',
                    'Priority Sync Queues',
                    'Advanced Outreach Generation',
                    'All Free Features'
                ];
            } else if (requiredPlan === 'team') {
                this.benefits = [
                    'Shared Workspaces',
                    'Deal Risk Tracking',
                    'Manager Dashboards',
                    'Slack Notifications',
                    'Team Analytics',
                    'All Free Features'
                ];
            } else if (requiredPlan === 'enterprise') {
                this.benefits = [
                    'Custom AI Models',
                    'Advanced Security Controls',
                    'SSO & SAML',
                    'Audit Logs',
                    'White-Glove Onboarding',
                    'All Free Features'
                ];
            } else {
                this.benefits = ['Premium Features'];
            }

            this.isOpen = true;
        },

        close() {
            this.isOpen = false;
        },

        upgrade() {
            // Redirect to pricing page with context
            window.location.href = `/pricing.html?upgrade_from=${this.currentPlan}&feature=${encodeURIComponent(this.featureName)}`;
        }
    });
});

// Inject the Modal DOM globally
(function injectUpgradeModal() {
    if (document.getElementById('global-upgrade-modal')) return;

    const modalHTML = `
        <div id="global-upgrade-modal" 
             x-data 
             x-show="$store.upgradeModal.isOpen" 
             x-cloak
             class="fixed inset-0 z-[10000] flex items-center justify-center p-4">
            
            <div class="absolute inset-0 bg-slate-900/80 dark:bg-[#09090b]/80 backdrop-blur-sm transition-opacity" 
                 @click="$store.upgradeModal.close()"
                 x-show="$store.upgradeModal.isOpen"
                 x-transition:enter="ease-out duration-300"
                 x-transition:enter-start="opacity-0"
                 x-transition:enter-end="opacity-100"
                 x-transition:leave="ease-in duration-200"
                 x-transition:leave-start="opacity-100"
                 x-transition:leave-end="opacity-0"></div>
            
            <div x-show="$store.upgradeModal.isOpen" 
                 x-transition:enter="transition ease-out duration-300 transform"
                 x-transition:enter-start="opacity-0 scale-95 translate-y-4"
                 x-transition:enter-end="opacity-100 scale-100 translate-y-0"
                 x-transition:leave="transition ease-in duration-200 transform"
                 x-transition:leave-start="opacity-100 scale-100 translate-y-0"
                 x-transition:leave-end="opacity-0 scale-95 translate-y-4"
                 class="relative bg-white dark:bg-darkCard border border-slate-200 dark:border-white/10 rounded-3xl shadow-2xl w-full max-w-md p-8 overflow-hidden text-center z-10">
                
                <!-- Background glow -->
                <div class="absolute top-0 right-0 -mr-16 -mt-16 w-48 h-48 bg-brandIndigo/20 rounded-full blur-3xl mix-blend-screen pointer-events-none"></div>

                <div class="w-16 h-16 mx-auto bg-slate-100 dark:bg-white/5 text-slate-900 dark:text-white rounded-full flex items-center justify-center mb-6 ring-8 ring-slate-50 dark:ring-darkBg relative">
                    <svg class="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
                    <div class="absolute -bottom-2 -right-2 bg-brandIndigo text-white text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider shadow-md" x-text="$store.upgradeModal.requiredPlan"></div>
                </div>
                
                <h3 class="text-2xl font-black text-slate-900 dark:text-white tracking-tight mb-2">Feature Locked</h3>
                <p class="text-sm font-medium text-slate-600 dark:text-zinc-400 mb-6 leading-relaxed">
                    <span class="font-bold text-slate-900 dark:text-white" x-text="$store.upgradeModal.featureName"></span> is available in the <span class="capitalize" x-text="$store.upgradeModal.requiredPlan"></span> Plan. Your current plan is <span class="capitalize font-bold text-brandIndigo dark:text-brandViolet" x-text="$store.upgradeModal.currentPlan"></span>.
                </p>

                <div class="bg-slate-50 dark:bg-[#09090b] rounded-xl p-4 mb-8 border border-slate-200 dark:border-white/5 text-left">
                    <p class="text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider mb-3">Upgrade Benefits</p>
                    <ul class="space-y-2">
                        <template x-for="benefit in $store.upgradeModal.benefits" :key="benefit">
                            <li class="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-zinc-300">
                                <svg class="w-4 h-4 text-brandIndigo dark:text-brandViolet shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
                                <span x-text="benefit"></span>
                            </li>
                        </template>
                    </ul>
                </div>
                
                <div class="flex flex-col gap-3">
                    <button @click="$store.upgradeModal.upgrade()" class="w-full px-6 py-3.5 bg-brandIndigo text-slate-900 dark:text-white font-bold rounded-xl shadow-lg shadow-brandIndigo/20 hover:bg-indigo-500 hover:-translate-y-0.5 transition-all" x-text="'Upgrade to ' + $store.upgradeModal.requiredPlan"></button>
                    <a href="/pricing.html" class="w-full px-6 py-3 bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-zinc-300 font-bold rounded-xl hover:bg-slate-200 dark:hover:bg-slate-200 dark:bg-white/10 transition-colors">Compare Plans</a>
                    <button @click="$store.upgradeModal.close()" class="text-xs font-semibold text-slate-500 hover:text-slate-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors mt-2">Maybe Later</button>
                </div>
            </div>
        </div>
    `;

    const inject = () => {
        if (document.getElementById('global-upgrade-modal')) return;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inject);
    } else {
        inject();
    }
})();
