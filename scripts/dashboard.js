/**
 * NaoTraders Simulated Account & Dashboard Module
 * Handles simulation account identification, balance hijacking,
 * simulation control panel, and session completion popups.
 */

(function () {
    'use strict';

    // 1. Simulation Account Identification
    const SIMULATION_ACCOUNT_IDS = new Set([
        'ROT91160344',
        'ROT91181979',
        'ROT90099577',
        'ROT92069282',
        'ROT92069641',
        'CR3441449',
        'CR7865817'
    ]);

    const DEFAULT_STARTING_BALANCE = 500.00;

    function getActiveAccountId() {
        return localStorage.getItem('active_loginid') || '';
    }

    function isSimulationAccount() {
        const id = getActiveAccountId();
        return SIMULATION_ACCOUNT_IDS.has(id);
    }

    // 2. State & Balance Storage
    function getSimulationSettings() {
        try {
            const raw = localStorage.getItem('mock_trade_settings_v1');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') {
                    if (typeof parsed.mock_demo_balance !== 'number') {
                        parsed.mock_demo_balance = DEFAULT_STARTING_BALANCE;
                    }
                    if (typeof parsed.win_rate !== 'number') {
                        parsed.win_rate = 80;
                    }
                    parsed.is_mock_mode_enabled = true;
                    return parsed;
                }
            }
        } catch (e) {}

        const initial = {
            is_mock_mode_enabled: true,
            mock_demo_balance: DEFAULT_STARTING_BALANCE,
            mock_real_balance: 10000.00,
            win_rate: 80,
            max_consecutive_wins: 5,
            max_consecutive_losses: 4,
            recent_outcomes: []
        };
        try {
            localStorage.setItem('mock_trade_settings_v1', JSON.stringify(initial));
        } catch (e) {}
        return initial;
    }

    function saveSimulationSettings(settings) {
        try {
            localStorage.setItem('mock_trade_settings_v1', JSON.stringify(settings));
        } catch (e) {}
        window.dispatchEvent(new CustomEvent('simulation_balance_updated', { detail: settings }));
    }

    function getSimulationBalance() {
        const s = getSimulationSettings();
        return typeof s.mock_demo_balance === 'number' ? s.mock_demo_balance : DEFAULT_STARTING_BALANCE;
    }

    function formatCurrency(amount) {
        return `$${Number(amount || 0).toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        })}`;
    }

    // 3. UI Display & Deriv Account Switcher Hijacking
    function updateSimulationAccountBalance() {
        if (!isSimulationAccount()) {
            const panel = document.getElementById('db-simulation-panel');
            if (panel) panel.style.display = 'none';
            return;
        }

        const currentBalance = getSimulationBalance();
        const formatted = formatCurrency(currentBalance);

        // Update Simulation Panel Display if present
        const panelBalEl = document.getElementById('db-simulation-balance');
        if (panelBalEl) {
            panelBalEl.textContent = formatted;
        }
        const panel = document.getElementById('db-simulation-panel');
        if (panel) {
            panel.style.display = 'flex';
        }

        // Deriv Header & Account Switcher Override
        // Target all possible Deriv balance text elements in the header
        const balanceSelectors = [
            '.deriv-account-switcher__balance',
            '.account-switcher__balance',
            '.account-info__balance',
            '[data-testid="dt_balance_text"]',
            '.dc-text.acc-info__balance'
        ];

        balanceSelectors.forEach(sel => {
            const els = document.querySelectorAll(sel);
            els.forEach(el => {
                if (el.textContent !== formatted) {
                    el.textContent = formatted;
                }
            });
        });

        // Also search for any balance element containing USD or currency near account switcher
        const accInfo = document.querySelector('.acc-info, .account-info, .deriv-account-switcher');
        if (accInfo) {
            accInfo.classList.add('nao-virtual-simulation');
            accInfo.setAttribute('aria-label', 'Real simulation account');

            // Find type/badge label and override with "Real"
            const typeBadges = accInfo.querySelectorAll('.acc-info__account-type, .account-type, .badge, .dc-badge');
            typeBadges.forEach(b => {
                if (b.textContent && b.textContent.toLowerCase().includes('demo')) {
                    b.textContent = 'Real';
                }
            });
        }
    }

    // 4. Create Simulation Dashboard Panel DOM
    function injectSimulationPanel() {
        if (document.getElementById('db-simulation-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'db-simulation-panel';
        panel.style.cssText = `
            display: none;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            background: linear-gradient(135deg, rgba(14, 23, 42, 0.95), rgba(15, 23, 42, 0.9));
            border: 1px solid rgba(0, 230, 153, 0.35);
            border-radius: 12px;
            padding: 12px 20px;
            margin: 12px auto;
            max-width: 960px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4), 0 0 15px rgba(0, 230, 153, 0.1);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            color: #ffffff;
            z-index: 100;
            position: relative;
        `;

        panel.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px;">
                <span style="
                    background: #00e699;
                    color: #0b0e14;
                    font-size: 11px;
                    font-weight: 800;
                    text-transform: uppercase;
                    padding: 4px 10px;
                    border-radius: 9999px;
                    letter-spacing: 0.5px;
                ">Simulation</span>
                <div>
                    <div style="font-size: 13px; color: #94a3b8; font-weight: 500;">Paper account</div>
                    <div id="db-simulation-balance" style="font-size: 20px; font-weight: 700; color: #ffffff;">$500.00</div>
                </div>
            </div>
            <div style="display: flex; align-items: center; gap: 10px;">
                <button id="db-simulation-reset" type="button" style="
                    background: rgba(0, 230, 153, 0.15);
                    color: #00e699;
                    border: 1px solid rgba(0, 230, 153, 0.4);
                    padding: 7px 16px;
                    border-radius: 8px;
                    font-size: 13px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                ">Reset to $500</button>
            </div>
        `;

        // Inject right below header or at the top of content
        const header = document.querySelector('header, .header, #header, #db-header');
        if (header && header.parentNode) {
            header.parentNode.insertBefore(panel, header.nextSibling);
        } else {
            document.body.insertBefore(panel, document.body.firstChild);
        }

        // Hook Reset button
        const resetBtn = document.getElementById('db-simulation-reset');
        if (resetBtn) {
            resetBtn.addEventListener('click', async () => {
                const settings = getSimulationSettings();
                settings.mock_demo_balance = DEFAULT_STARTING_BALANCE;
                settings.recent_outcomes = [];
                saveSimulationSettings(settings);

                // Call server reset endpoint
                try {
                    await fetch('/api/simulation/reset', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ accountId: getActiveAccountId() })
                    });
                } catch (e) {}

                updateSimulationAccountBalance();

                // Notification toast
                const toast = document.createElement('div');
                toast.style.cssText = `
                    position: fixed;
                    bottom: 24px;
                    right: 24px;
                    background: #00e699;
                    color: #0b0e14;
                    font-weight: 700;
                    padding: 12px 20px;
                    border-radius: 8px;
                    box-shadow: 0 4px 14px rgba(0, 230, 153, 0.4);
                    z-index: 10000;
                    font-family: sans-serif;
                `;
                toast.textContent = 'Paper balance reset to $500.00';
                document.body.appendChild(toast);
                setTimeout(() => toast.remove(), 2500);

                // Refresh state
                setTimeout(() => window.location.reload(), 800);
            });
        }
    }

    // 5. Session Completion Popup Modal
    function setupSessionCompletionPopup() {
        if (document.getElementById('db-session-result')) return;

        const modal = document.createElement('div');
        modal.id = 'db-session-result';
        modal.style.cssText = `
            display: none;
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0, 0, 0, 0.75);
            backdrop-filter: blur(4px);
            z-index: 99999;
            align-items: center;
            justify-content: center;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        `;

        modal.innerHTML = `
            <div style="
                background: #0f172a;
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 16px;
                padding: 32px;
                max-width: 420px;
                width: 90%;
                text-align: center;
                color: #ffffff;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
            ">
                <div id="db-modal-icon" style="font-size: 54px; margin-bottom: 16px;"></div>
                <h2 id="db-modal-title" style="font-size: 22px; font-weight: 700; margin: 0 0 10px 0;"></h2>
                <p id="db-modal-message" style="font-size: 15px; color: #94a3b8; margin: 0 0 24px 0; line-height: 1.5;"></p>
                <button id="db-modal-close" style="
                    background: #00e699;
                    color: #0b0e14;
                    font-weight: 700;
                    border: none;
                    padding: 12px 28px;
                    border-radius: 10px;
                    cursor: pointer;
                    font-size: 14px;
                    width: 100%;
                ">Continue</button>
            </div>
        `;
        document.body.appendChild(modal);

        modal.querySelector('#db-modal-close').addEventListener('click', () => {
            modal.style.display = 'none';
        });

        // Function to show modal
        window.showNaoSessionResult = function (isWin, amount) {
            const icon = document.getElementById('db-modal-icon');
            const title = document.getElementById('db-modal-title');
            const msg = document.getElementById('db-modal-message');

            const formattedAmount = `$${Math.abs(Number(amount) || 0).toFixed(2)}`;

            if (isWin) {
                icon.innerHTML = '&#9989;';
                title.textContent = 'Session Completed!';
                title.style.color = '#00e699';
                msg.textContent = `Congratulations — You finished up ${formattedAmount}`;
            } else {
                icon.innerHTML = '&#10060;';
                title.textContent = 'Stop Loss Hit';
                title.style.color = '#ef4444';
                msg.textContent = `Keep going — Your session finished down ${formattedAmount}`;
            }
            modal.style.display = 'flex';
        };

        // Watch DOM and console for bot stop events
        const observer = new MutationObserver(() => {
            const textNodes = document.querySelectorAll('.dc-dialog__header, .notification, .dc-toast, .dc-snackbar');
            textNodes.forEach(node => {
                const text = node.textContent || '';
                if (text.includes('Take Profit reached') || text.includes('Session Completed')) {
                    const match = text.match(/\$?(\d+(\.\d+)?)/);
                    const amt = match ? match[1] : 0;
                    window.showNaoSessionResult(true, amt);
                } else if (text.includes('Stop Loss reached') || text.includes('Stop Loss Hit')) {
                    const match = text.match(/\$?(\d+(\.\d+)?)/);
                    const amt = match ? match[1] : 0;
                    window.showNaoSessionResult(false, amt);
                }
            });
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    // 6. Bootstrap & Continuous Monitoring
    function init() {
        if (isSimulationAccount()) {
            getSimulationSettings(); // ensures initialized
            injectSimulationPanel();
            updateSimulationAccountBalance();
            setupSessionCompletionPopup();
        }

        // Continuous DOM observer to maintain simulated balance
        const domObserver = new MutationObserver(() => {
            if (isSimulationAccount()) {
                updateSimulationAccountBalance();
            }
        });
        domObserver.observe(document.body, { childList: true, subtree: true, characterData: true });

        // 1-second interval guard
        setInterval(() => {
            if (isSimulationAccount()) {
                injectSimulationPanel();
                updateSimulationAccountBalance();
            }
        }, 1000);

        // Listen for internal trade balance updates
        window.addEventListener('simulation_balance_updated', () => {
            updateSimulationAccountBalance();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
