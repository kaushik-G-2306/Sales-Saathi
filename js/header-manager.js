
const HeaderManager = {
    async init() {
        try {
            const mountPoint = document.getElementById('global-header-mount');
            if (!mountPoint) {
                console.warn('HeaderManager: #global-header-mount not found in DOM.');
                return;
            }

            // Fetch the header HTML
            const response = await fetch('/components/header.html');
            if (!response.ok) {
                throw new Error(`Failed to load header: ${response.statusText}`);
            }
            
            const html = await response.text();
            
            // Inject HTML
            mountPoint.innerHTML = html;



        } catch (err) {
            console.error('HeaderManager Error:', err);
        }
    }
};

// Initialize immediately
HeaderManager.init();

export { HeaderManager };
