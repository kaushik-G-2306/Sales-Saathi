/**
 * Global Theme Manager
 * Ensures that the dark/light mode preference is loaded instantly to prevent FOUC (Flash of Unstyled Content).
 * Also registers an Alpine.js global store for theme interaction.
 */

(function () {
    const THEME_STORAGE_KEY = '_x_darkMode';

    // Helper to apply the class directly to <html>
    function applyThemeClass(isDark) {
        if (isDark) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }

    // 1. Synchronously execute BEFORE page render
    let isDark = true; // Default to dark mode
    try {
        const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
        if (storedTheme !== null) {
            isDark = storedTheme === 'true';
        } else {
            // Set default if empty
            localStorage.setItem(THEME_STORAGE_KEY, 'true');
        }
    } catch (e) {
        console.error('Local storage error in theme-manager:', e);
    }

    applyThemeClass(isDark);

    // 2. Setup Alpine Global Store on init
    document.addEventListener('alpine:init', () => {
        Alpine.store('theme', {
            isDark: isDark,
            
            toggle() {
                this.isDark = !this.isDark;
                localStorage.setItem(THEME_STORAGE_KEY, this.isDark.toString());
                applyThemeClass(this.isDark);
            }
        });

        // Register Global Demo Modal Store
        Alpine.store('demoModal', {
            isOpen: false,
            open() {
                this.isOpen = true;
                document.body.style.overflow = 'hidden';
            },
            close() {
                this.isOpen = false;
                document.body.style.overflow = '';
            }
        });

        // Register Global Upgrade Modal Store
        Alpine.store('upgradeModal', {
            isOpen: false,
            featureName: '',
            requiredPlan: '',
            open(featureName, requiredPlan) {
                this.featureName = featureName;
                this.requiredPlan = requiredPlan;
                this.isOpen = true;
                document.body.style.overflow = 'hidden';
            },
            close() {
                this.isOpen = false;
                document.body.style.overflow = '';
            }
        });
    });
})();
