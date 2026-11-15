/**
 * NaoTraders Simulation Engine & Live WebSocket Interceptor
 * Intercepts WebSocket balance messages, Deriv balance updates,
 * and DOM balance renders to enforce simulated balances seamlessly.
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

    const DEFAULT_REAL_BALANCE = 300.00;
    const DEFAULT_DEMO_BALANCE = 10000.00;

    function getActiveAccountId() {
        return localStorage.getItem('active_loginid') || '';
    }

    function isSimulationRealAccount(id) {
        const acc = id || getActiveAccountId();
        return SIMULATION_REAL_ACCOUNT_IDS.has(acc);
    }

    function isDemoAccount(id) {
        const acc = id || getActiveAccountId();
        return acc.startsWith('VR') || acc.startsWith('DEM') || acc.startsWith('DOT');
    }

    function getSimulatedBalance(loginid) {
        if (isDemoAccount(loginid)) return DEFAULT_DEMO_BALANCE;
        if (isSimulationRealAccount(loginid)) return DEFAULT_REAL_BALANCE;
        return null;
    }

    // 1. Initialise localStorage state
    function initSimulationState() {
        try {
            const raw = localStorage.getItem('mock_trade_settings_v1');
            let s = raw ? JSON.parse(raw) : null;
            if (!s || typeof s !== 'object') {
                s = {
                    trading_mode: 'mock',
                    is_mock_mode_enabled: true,
                    mock_demo_balance: DEFAULT_DEMO_BALANCE,
                    mock_real_balance: DEFAULT_REAL_BALANCE,
                    win_rate: 80,
                    max_consecutive_wins: 5,
                    max_consecutive_losses: 4,
                    recent_outcomes: []
                };
            } else {
                s.is_mock_mode_enabled = true;
                s.mock_demo_balance = DEFAULT_DEMO_BALANCE;
                s.mock_real_balance = DEFAULT_REAL_BALANCE;
            }
            localStorage.setItem('mock_trade_settings_v1', JSON.stringify(s));
        } catch (e) {}

        // Synchronize clientAccounts in localStorage
        try {
            const rawAccounts = localStorage.getItem('clientAccounts');
            if (rawAccounts) {
                const accounts = JSON.parse(rawAccounts);
                let changed = false;
                for (const id in accounts) {
                    const sim = getSimulatedBalance(id);
                    if (sim !== null) {
                        accounts[id].balance = sim;
                        changed = true;
                    }
                }
                if (changed) {
                    localStorage.setItem('clientAccounts', JSON.stringify(accounts));
                }
            }
        } catch (e) {}
    }

    initSimulationState();

    // 2. Intercept Native WebSocket at the browser level
    const OriginalWebSocket = window.WebSocket;
    window.WebSocket = function (url, protocols) {
        const ws = new OriginalWebSocket(url, protocols);

        function modifyMessageData(data) {
            if (typeof data !== 'string') return data;
            try {
                const msg = JSON.parse(data);

                // Intercept balance stream
                if (msg.msg_type === 'balance' && msg.balance) {
                    const loginid = msg.balance.loginid || getActiveAccountId();
                    const sim = getSimulatedBalance(loginid);
                    if (sim !== null) {
                        msg.balance.balance = sim;
                        if (msg.balance.accounts) {
                            for (const acc in msg.balance.accounts) {
                                const accSim = getSimulatedBalance(acc);
                                if (accSim !== null) {
                                    msg.balance.accounts[acc].balance = accSim;
                                }
                            }
                        }
                        return JSON.stringify(msg);
                    }
                }

                // Intercept authorize response
                if (msg.msg_type === 'authorize' && msg.authorize) {
                    const loginid = msg.authorize.loginid;
                    const sim = getSimulatedBalance(loginid);
                    if (sim !== null) {
                        msg.authorize.balance = sim;
                    }
                    if (msg.authorize.account_list && Array.isArray(msg.authorize.account_list)) {
                        msg.authorize.account_list.forEach(acc => {
                            const accSim = getSimulatedBalance(acc.loginid);
                            if (accSim !== null && acc.balance !== undefined) {
                                acc.balance = accSim;
                            }
                        });
                    }
                    return JSON.stringify(msg);
                }

                // Intercept get_account_status or get_settings if balance attached
                if (msg.accounts) {
                    for (const acc in msg.accounts) {
                        const accSim = getSimulatedBalance(acc);
                        if (accSim !== null) {
                            msg.accounts[acc].balance = accSim;
                        }
                    }
                    return JSON.stringify(msg);
                }
            } catch (err) {}
            return data;
        }

        // Wrap addEventListener
        const originalAddEventListener = ws.addEventListener.bind(ws);
        ws.addEventListener = function (type, listener, options) {
            if (type === 'message' && typeof listener === 'function') {
                const wrappedListener = function (event) {
                    const modifiedData = modifyMessageData(event.data);
                    if (modifiedData !== event.data) {
                        Object.defineProperty(event, 'data', {
                            get: () => modifiedData,
                            configurable: true
                        });
                    }
                    return listener.apply(this, arguments);
                };
                return originalAddEventListener(type, wrappedListener, options);
            }
            return originalAddEventListener(type, listener, options);
        };

        // Wrap onmessage property
        let userOnMessage = null;
        Object.defineProperty(ws, 'onmessage', {
            get: () => userOnMessage,
            set: (callback) => {
                if (typeof callback === 'function') {
                    userOnMessage = callback;
                    ws.addEventListener('message', callback);
                } else {
                    userOnMessage = null;
                }
            },
            configurable: true
        });

        return ws;
    };

    // Preserve static WebSocket constants
    window.WebSocket.CONNECTING = OriginalWebSocket.CONNECTING;
    window.WebSocket.OPEN = OriginalWebSocket.OPEN;
    window.WebSocket.CLOSING = OriginalWebSocket.CLOSING;
    window.WebSocket.CLOSED = OriginalWebSocket.CLOSED;
    window.WebSocket.prototype = OriginalWebSocket.prototype;

    // 3. Fallback DOM Observer: Ensure visible header/switcher text is overwritten if rendered
    function checkAndFormatBalances() {
        const activeId = getActiveAccountId();
        const sim = getSimulatedBalance(activeId);
        if (sim === null) return;

        // Target balance display elements in Deriv UI
        const balanceSelectors = [
            '.acc-info__balance',
            '[data-testid="dt_balance"]',
            '.acc-info__account-type-and-balance',
            '.account-switcher__balance'
        ];

        balanceSelectors.forEach(sel => {
            document.querySelectorAll(sel).forEach(el => {
                const text = el.textContent || '';
                // If it doesn't already reflect simulated balance
                const targetStr = sim.toFixed(2);
                if (text && !text.includes(targetStr)) {
                    // Replace balance numbers keeping currency symbol
                    el.textContent = text.replace(/[\d,]+\.\d{2}/, targetStr);
                }
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setInterval(checkAndFormatBalances, 250);
        });
    } else {
        setInterval(checkAndFormatBalances, 250);
    }
})();
