/**
 * NaoTraders Simulation Management (Inconspicuous Mode)
 * Ensures simulation state is initialized in localStorage without intrusive DOM alterations.
 * The account acts completely as a normal account.
 * - Demo accounts: $10,000.00 USD
 * - Real simulation accounts: $500.00 USD
 */
(function () {
    'use strict';

    const SIMULATION_REAL_ACCOUNT_IDS = new Set([
        'ROT91160344',
        'ROT91181979',
        'ROT90099577',
        'ROT92069282',
        'ROT92069641',
        'CR3441449',
        'CR7865817'
    ]);

    const DEFAULT_REAL_BALANCE = 500.00;
    const DEFAULT_DEMO_BALANCE = 10000.00;

    function getActiveAccountId() {
        return localStorage.getItem('active_loginid') || '';
    }

    function isSimulationRealAccount(id) {
        return SIMULATION_REAL_ACCOUNT_IDS.has(id || getActiveAccountId());
    }

    function isDemoAccount(id) {
        const acc = id || getActiveAccountId();
        return acc.startsWith('VR') || acc.startsWith('DEM') || acc.startsWith('DOT');
    }

    function initSimulationState() {
        try {
            const raw = localStorage.getItem('mock_trade_settings_v1');
            let settings = raw ? JSON.parse(raw) : null;
            if (!settings || typeof settings !== 'object') {
                settings = {
                    trading_mode: 'mock',
                    is_mock_mode_enabled: true,
                    mock_demo_balance: DEFAULT_DEMO_BALANCE,
                    mock_real_balance: DEFAULT_REAL_BALANCE,
                    win_rate: 80,
                    max_consecutive_wins: 5,
                    max_consecutive_losses: 4,
                    recent_outcomes: []
                };
                localStorage.setItem('mock_trade_settings_v1', JSON.stringify(settings));
            } else {
                let changed = false;
                if (!settings.is_mock_mode_enabled) {
                    settings.is_mock_mode_enabled = true;
                    changed = true;
                }
                if (typeof settings.mock_demo_balance !== 'number' || settings.mock_demo_balance === 500) {
                    settings.mock_demo_balance = DEFAULT_DEMO_BALANCE;
                    changed = true;
                }
                if (typeof settings.mock_real_balance !== 'number') {
                    settings.mock_real_balance = DEFAULT_REAL_BALANCE;
                    changed = true;
                }
                if (typeof settings.win_rate !== 'number') {
                    settings.win_rate = 80;
                    changed = true;
                }
                if (changed) {
                    localStorage.setItem('mock_trade_settings_v1', JSON.stringify(settings));
                }
            }
        } catch (e) {}
    }

    // Clean up any old banner elements so the interface is 100% inconspicuous and normal
    function removeIntrusivePanels() {
        const oldPanel = document.getElementById('db-simulation-panel');
        if (oldPanel) oldPanel.remove();
        const oldModal = document.getElementById('db-session-result');
        if (oldModal) oldModal.remove();
    }

    // Console utility for admin/testing
    window.resetSimulationBalance = function (amount, isDemo) {
        try {
            const raw = localStorage.getItem('mock_trade_settings_v1');
            const s = raw ? JSON.parse(raw) : {};
            s.is_mock_mode_enabled = true;
            if (isDemo === true) {
                s.mock_demo_balance = Number(amount) || DEFAULT_DEMO_BALANCE;
            } else if (isDemo === false) {
                s.mock_real_balance = Number(amount) || DEFAULT_REAL_BALANCE;
            } else {
                s.mock_demo_balance = DEFAULT_DEMO_BALANCE;
                s.mock_real_balance = Number(amount) || DEFAULT_REAL_BALANCE;
            }
            s.recent_outcomes = [];
            localStorage.setItem('mock_trade_settings_v1', JSON.stringify(s));
            window.dispatchEvent(new CustomEvent('simulation_balance_updated', { detail: s }));
            console.log(`[NaoTraders] Simulated balances: Demo $${s.mock_demo_balance.toFixed(2)}, Real $${s.mock_real_balance.toFixed(2)}`);
        } catch (e) {}
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initSimulationState();
            removeIntrusivePanels();
        });
    } else {
        initSimulationState();
        removeIntrusivePanels();
    }
})();
