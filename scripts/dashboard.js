/* NaoTrades Premium Dashboard Controller */

(function () {
    const DASHBOARD_TEMPLATE = `
        <div class="db-greeting-section">
            <h1 class="db-greeting-title">Hello <span class="username">DOT92329066</span> 👋</h1>
            <p class="db-greeting-subtitle">"Small consistent gains build extraordinary wealth."</p>
        </div>

        <div class="db-quick-actions-wrapper">
            <span class="db-quick-actions-label">Quick Actions</span>
            <div class="db-quick-actions-grid">
                
                <!-- Upload Bot -->
                <div class="db-action-card db-card-upload" id="db-action-upload">
                    <div class="db-card-arrow">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>
                    </div>
                    <div class="db-card-icon-container">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2"/></svg>
                    </div>
                    <h2 class="db-card-title">Upload Bot</h2>
                    <p class="db-card-desc">Import an XML bot from your computer</p>
                    <a href="javascript:void(0)" class="db-card-link">Open &rarr;</a>
                </div>

                <!-- Free Bots -->
                <div class="db-action-card db-card-free" id="db-action-free">
                    <div class="db-card-arrow">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>
                    </div>
                    <div class="db-card-icon-container">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>
                    </div>
                    <h2 class="db-card-title">Free Bots</h2>
                    <p class="db-card-desc">Browse ready-made trading strategies</p>
                    <a href="javascript:void(0)" class="db-card-link">Open &rarr;</a>
                </div>

                <!-- Bot Editor -->
                <div class="db-action-card db-card-editor" id="db-action-editor">
                    <div class="db-card-arrow">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>
                    </div>
                    <div class="db-card-icon-container">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="14" y="3" rx="1"/><path d="M10 21V8a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1z"/><path d="M15 21v-5a1 1 0 0 0-1-1h-4"/></svg>
                    </div>
                    <h2 class="db-card-title">Bot Editor</h2>
                    <p class="db-card-desc">Build a custom bot with the visual editor</p>
                    <a href="javascript:void(0)" class="db-card-link">Open &rarr;</a>
                </div>

                <!-- Quick Strategy -->
                <div class="db-action-card db-card-strategy" id="db-action-strategy">
                    <div class="db-card-arrow">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>
                    </div>
                    <div class="db-card-icon-container">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                    </div>
                    <h2 class="db-card-title">Quick Strategy</h2>
                    <p class="db-card-desc">Start fast with a pre-built strategy template</p>
                    <a href="javascript:void(0)" class="db-card-link">Open &rarr;</a>
                </div>

            </div>
        </div>

        <div class="db-partner-card">
            <div class="db-partner-left-space"></div>
            <div class="db-partner-content">
                <span class="db-partner-subtitle">Partner Referral</span>
                <h2 class="db-partner-title">Master Partner share</h2>
            </div>
            <button class="db-partner-btn" onclick="window.open('https://naotraders.com/referral', '_blank')">Earn monthly</button>
        </div>
    `;

    function initDashboard() {
        const container = document.querySelector('.main__container');
        const dcTabs = document.querySelector('.dc-tabs--main__tabs');
        
        if (!container || !dcTabs) {
            // Retry in case DOM is not fully parsed yet
            setTimeout(initDashboard, 50);
            return;
        }

        // Avoid double injection
        if (document.getElementById('custom-dashboard')) return;

        const customDashboard = document.createElement('div');
        customDashboard.id = 'custom-dashboard';
        customDashboard.innerHTML = DASHBOARD_TEMPLATE;
        
        // Insert right after tab bar
        dcTabs.insertAdjacentElement('afterend', customDashboard);

        // Bind interactive event listeners for action cards
        document.getElementById('db-action-upload').addEventListener('click', () => {
            const botBuilderTab = document.getElementById('id-2');
            if (botBuilderTab) {
                botBuilderTab.click();
                setTimeout(() => {
                    const importBtn = document.getElementById('db-toolbar__import-button');
                    if (importBtn) importBtn.click();
                }, 200);
            }
        });

        document.getElementById('db-action-free').addEventListener('click', () => {
            const freeBotsTab = document.getElementById('id-3');
            if (freeBotsTab) freeBotsTab.click();
        });

        document.getElementById('db-action-editor').addEventListener('click', () => {
            const botBuilderTab = document.getElementById('id-2');
            if (botBuilderTab) botBuilderTab.click();
        });

        document.getElementById('db-action-strategy').addEventListener('click', () => {
            const botBuilderTab = document.getElementById('id-2');
            if (botBuilderTab) {
                botBuilderTab.click();
                setTimeout(() => {
                    const quickBtn = document.getElementById('db-toolbar__get-started-button');
                    if (quickBtn) quickBtn.click();
                }, 200);
            }
        });

        // Initialize state check
        updateTabVisibility();
        setupObserver();
    }

    function updateGreeting() {
        const usernameSpan = document.querySelector('#custom-dashboard .username');
        if (usernameSpan) {
            const activeLoginId = localStorage.getItem('active_loginid') || 'DOT92329066';
            usernameSpan.textContent = activeLoginId;
        }
    }

    function updateTabVisibility() {
        const dashboardTab = document.getElementById('id-1');
        const customDashboard = document.getElementById('custom-dashboard');
        const botDashboard = document.querySelector('.bot-dashboard');
        
        if (!customDashboard || !botDashboard) return;

        const isDashboardActive = dashboardTab && dashboardTab.classList.contains('dc-tabs__active');
        if (isDashboardActive) {
            customDashboard.classList.add('active');
            botDashboard.classList.add('dashboard-active');
            updateGreeting();

            // Ensure footer control panel is visible at bottom
            const runStrategy = document.querySelector('.main__run-strategy-wrapper');
            if (runStrategy) {
                runStrategy.style.display = 'block';
            }
        } else {
            customDashboard.classList.remove('active');
            botDashboard.classList.remove('dashboard-active');
        }
    }

    function setupObserver() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    updateTabVisibility();
                }
            });
        });

        // Observe class changes of all tabs
        for (let i = 1; i <= 14; i++) {
            const tabEl = document.getElementById(`id-${i}`);
            if (tabEl) {
                observer.observe(tabEl, { attributes: true });
            }
        }

        // Listen for storage change (if account updates in another tab)
        window.addEventListener('storage', (e) => {
            if (e.key === 'active_loginid') {
                updateGreeting();
            }
        });

        // Also poll loginid check periodically to guarantee reactivity when hydrated dynamically
        setInterval(updateGreeting, 1000);
    }

    // Run when DOM is ready or immediately if already loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initDashboard);
    } else {
        initDashboard();
    }
})();
