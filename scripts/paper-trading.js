(function () {
    'use strict';

    const PAPER_ACCOUNTS = new Set([
        'ROT91160344',
        'ROT91181979',
        'ROT90099577',
        'ROT92069282',
        'ROT92069641',
        'CR3441449',
        'CR7865817'
    ]);
    const PAPER_STATE_KEY = 'nao_paper_trading_state_v1';
    const SETTINGS_KEY = 'mock_trade_settings_v1';
    const DEFAULT_BALANCE = 300;
    const DEFAULT_DEMO_BALANCE = 10000;
    const DEFAULT_WIN_RATE = 80;
    const MAX_HISTORY = 500;
    const MAX_DURATION_MS = 24 * 60 * 60 * 1000;
    const OriginalWebSocket = window.WebSocket;
    const subscriptions = new Map();
    const settlementTimers = new Map();
    let contractSequence = Date.now() * 1000;
    let paperState = loadPaperState();
    let logoutDetection = { accountId: '', authTokenRemoved: false, timer: null };

    function loadPaperState() {
        try {
            const raw = localStorage.getItem(PAPER_STATE_KEY);
            if (!raw) return { version: 1, accounts: {} };

            const state = JSON.parse(raw);
            if (!state || state.version !== 1 || !state.accounts || typeof state.accounts !== 'object') {
                throw new Error('Stored paper-trading data has an unsupported format.');
            }
            for (const accountId of Object.keys(state.accounts)) {
                const account = state.accounts[accountId];
                if (!account || !Number.isFinite(Number(account.balance)) || Number(account.balance) < 0 ||
                    !account.session || !Number.isFinite(Number(account.session.trades)) ||
                    !Number.isFinite(Number(account.session.won)) || !Number.isFinite(Number(account.session.lost)) ||
                    !Number.isFinite(Number(account.session.profit)) || !Array.isArray(account.trades) ||
                    !Array.isArray(account.recent_outcomes)) {
                    throw new Error('Stored paper-trading account data is invalid.');
                }
                if (!account.trades.every(function (trade) {
                    return trade && trade.contract_id !== undefined &&
                        (trade.status === 'open' || trade.status === 'sold') &&
                        Number.isFinite(Number(trade.settle_at));
                })) {
                    throw new Error('Stored paper-trade history is invalid.');
                }
            }
            return state;
        } catch (error) {
            console.error('Paper trading is unavailable because its local data could not be loaded.', error);
            return null;
        }
    }

    function isPaperAccount(accountId) {
        const id = accountId || localStorage.getItem('active_loginid') || '';
        return PAPER_ACCOUNTS.has(id) || id.startsWith('VR') || id.startsWith('DEM') || id.startsWith('DOT');
    }

    function createAccountState(accountId) {
        return {
            balance: isDemoAccount(accountId) ? DEFAULT_DEMO_BALANCE : DEFAULT_BALANCE,
            session: { trades: 0, won: 0, lost: 0, profit: 0 },
            recent_outcomes: [],
            trades: []
        };
    }

    function isDemoAccount(accountId) {
        return accountId.startsWith('VR') || accountId.startsWith('DEM') || accountId.startsWith('DOT');
    }

    function readSettings() {
        const defaults = {
            win_rate: DEFAULT_WIN_RATE,
            max_consecutive_wins: 5,
            max_consecutive_losses: 4
        };

        try {
            const raw = localStorage.getItem(SETTINGS_KEY);
            const saved = raw ? JSON.parse(raw) : null;
            if (!saved || typeof saved !== 'object') return defaults;

            const rate = Number(saved.win_rate);
            const maxWins = Number(saved.max_consecutive_wins);
            const maxLosses = Number(saved.max_consecutive_losses);
            return {
                win_rate: Number.isFinite(rate) ? Math.max(0, Math.min(100, rate)) : defaults.win_rate,
                max_consecutive_wins: Number.isInteger(maxWins) && maxWins > 0 ? maxWins : defaults.max_consecutive_wins,
                max_consecutive_losses: Number.isInteger(maxLosses) && maxLosses > 0 ? maxLosses : defaults.max_consecutive_losses
            };
        } catch (error) {
            console.error('Unable to read paper-trading outcome settings; using the default win rate.', error);
            return defaults;
        }
    }

    function getAccountState(accountId) {
        if (!paperState) throw new Error('Paper-trading data is unavailable.');
        return paperState.accounts[accountId] || createAccountState(accountId);
    }

    function updateAccountState(accountId, update) {
        if (!paperState) throw new Error('Paper-trading data is unavailable.');

        const next = JSON.parse(JSON.stringify(paperState));
        const account = next.accounts[accountId] || createAccountState(accountId);
        update(account);
        account.balance = Number(account.balance);
        if (!Number.isFinite(account.balance) || account.balance < 0) {
            throw new Error('Paper-trading balance would become invalid.');
        }
        const openTrades = account.trades.filter(function (trade) {
            return trade.status === 'open';
        });
        const settledTrades = account.trades.filter(function (trade) {
            return trade.status !== 'open';
        });
        account.trades = openTrades.concat(settledTrades.slice(-MAX_HISTORY));
        account.recent_outcomes = account.recent_outcomes.slice(-MAX_HISTORY);
        next.accounts[accountId] = account;

        localStorage.setItem(PAPER_STATE_KEY, JSON.stringify(next));
        paperState = next;
        syncClientAccountBalance(accountId, account.balance);
        return account;
    }

    function syncClientAccountBalance(accountId, balance) {
        try {
            const raw = localStorage.getItem('clientAccounts');
            if (!raw) return;
            const accounts = JSON.parse(raw);
            if (!accounts[accountId]) return;
            accounts[accountId].balance = balance;
            localStorage.setItem('clientAccounts', JSON.stringify(accounts));
        } catch (error) {
            console.error('Unable to synchronize the displayed paper balance.', error);
        }
    }

    function clearSettlementTimers(accountId) {
        const timers = settlementTimers.get(accountId);
        if (!timers) return;
        timers.forEach(clearTimeout);
        settlementTimers.delete(accountId);
    }

    function scheduleSettlement(socket, accountId, contractId, delay) {
        let timers = settlementTimers.get(accountId);
        if (!timers) {
            timers = new Set();
            settlementTimers.set(accountId, timers);
        }

        let timer;
        timer = setTimeout(function () {
            timers.delete(timer);
            if (!timers.size) settlementTimers.delete(accountId);
            settleTrade(socket, accountId, contractId);
        }, delay);
        timers.add(timer);
    }

    function resetPaperAccount(accountId) {
        clearSettlementTimers(accountId);
        if (paperState && paperState.accounts[accountId]) {
            const contractIds = new Set(paperState.accounts[accountId].trades.map(function (trade) {
                return String(trade.contract_id);
            }));
            for (const [contractId, items] of subscriptions.entries()) {
                if (!contractIds.has(contractId)) continue;
                subscriptions.delete(contractId);
            }

            try {
                const next = JSON.parse(JSON.stringify(paperState));
                delete next.accounts[accountId];
                localStorage.setItem(PAPER_STATE_KEY, JSON.stringify(next));
                paperState = next;
            } catch (error) {
                console.error('Unable to reset the logged-out paper account.', error);
                return;
            }
        }

        syncClientAccountBalance(
            accountId,
            isDemoAccount(accountId) ? DEFAULT_DEMO_BALANCE : DEFAULT_BALANCE
        );
    }

    function confirmLogout(accountId) {
        if (logoutDetection.timer !== null) clearTimeout(logoutDetection.timer);
        logoutDetection = { accountId: '', authTokenRemoved: false, timer: null };
        resetPaperAccount(accountId);
    }

    function scheduleLogoutDetectionReset() {
        if (logoutDetection.timer !== null) return;
        logoutDetection.timer = setTimeout(function () {
            logoutDetection = { accountId: '', authTokenRemoved: false, timer: null };
        }, 0);
    }

    const originalRemoveItem = localStorage.removeItem.bind(localStorage);
    const originalClear = localStorage.clear.bind(localStorage);
    localStorage.removeItem = function (key) {
        const accountId = key === 'active_loginid' ? localStorage.getItem('active_loginid') : '';
        const result = originalRemoveItem(key);

        if (key === 'authToken') {
            if (logoutDetection.accountId) {
                confirmLogout(logoutDetection.accountId);
            } else {
                logoutDetection.authTokenRemoved = true;
                scheduleLogoutDetectionReset();
            }
        } else if (key === 'active_loginid' && accountId) {
            if (logoutDetection.authTokenRemoved) {
                confirmLogout(accountId);
            } else {
                logoutDetection.accountId = accountId;
                scheduleLogoutDetectionReset();
            }
        }
        return result;
    };
    localStorage.clear = function () {
        const paperStateRaw = localStorage.getItem(PAPER_STATE_KEY);
        const result = originalClear();
        if (paperStateRaw !== null) localStorage.setItem(PAPER_STATE_KEY, paperStateRaw);
        return result;
    };

    function chooseOutcome(accountId) {
        const settings = readSettings();
        const account = getAccountState(accountId);
        const outcomes = account.recent_outcomes;
        const countTrailing = (outcome) => {
            let count = 0;
            for (let index = outcomes.length - 1; index >= 0 && outcomes[index] === outcome; index--) {
                count++;
            }
            return count;
        };

        if (countTrailing('win') >= settings.max_consecutive_wins) return false;
        if (countTrailing('loss') >= settings.max_consecutive_losses) return true;
        return Math.random() * 100 < settings.win_rate;
    }

    function getDurationMs(parameters) {
        const duration = Number(parameters.duration);
        if (!Number.isFinite(duration) || duration <= 0) return 1000;
        const units = { t: 1000, s: 1000, m: 60000, h: 3600000, d: 86400000 };
        const unit = String(parameters.duration_unit || 't').toLowerCase();
        return Math.min(MAX_DURATION_MS, Math.max(1000, duration * (units[unit] || 1000)));
    }

    function dispatchMessage(socket, message) {
        setTimeout(function () {
            if (socket.readyState === OriginalWebSocket.CLOSED) return;
            socket.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(message) }));
        }, 0);
    }

    function sendResponse(socket, request, messageType, payload) {
        dispatchMessage(socket, Object.assign({
            msg_type: messageType,
            echo_req: request,
            req_id: request.req_id
        }, payload));
    }

    function sendError(socket, request, messageType, code, message) {
        sendResponse(socket, request, messageType, {
            error: { code: code, message: message }
        });
    }

    function emitBalance(socket, accountId) {
        const account = getAccountState(accountId);
        dispatchMessage(socket, {
            msg_type: 'balance',
            balance: {
                balance: account.balance,
                currency: 'USD',
                loginid: accountId
            }
        });
    }

    function findTrade(contractId) {
        if (!paperState) return null;
        const id = String(contractId);
        for (const accountId of Object.keys(paperState.accounts)) {
            const account = paperState.accounts[accountId];
            const trade = account.trades.find(function (item) {
                return String(item.contract_id) === id;
            });
            if (trade) return { accountId: accountId, trade: trade };
        }
        return null;
    }

    function makeContract(trade, isFinal) {
        const profit = isFinal ? Number(trade.profit) || 0 : 0;
        const soldFor = isFinal && trade.won ? trade.payout : 0;
        return {
            contract_id: Number(trade.contract_id),
            contract_type: trade.contract_type,
            symbol: trade.symbol,
            underlying: trade.symbol,
            currency: trade.currency,
            buy_price: trade.stake,
            payout: trade.payout,
            profit: profit,
            status: isFinal ? 'sold' : 'open',
            is_sold: isFinal,
            is_expired: isFinal,
            is_valid_to_sell: !isFinal,
            is_virtual_trade: true,
            longcode: 'PAPER TRADE: locally simulated outcome. No Deriv order was placed.',
            date_start: Math.floor(trade.created_at / 1000),
            date_expiry: Math.floor(trade.settle_at / 1000),
            ...(isFinal ? {
                sell_price: soldFor,
                bid_price: soldFor,
                sell_time: Math.floor(Date.now() / 1000)
            } : {})
        };
    }

    function notifySettled(socket, trade) {
        const listeners = subscriptions.get(String(trade.contract_id)) || [];
        listeners.forEach(function (subscription) {
            if (subscription.socket !== socket) return;
            dispatchMessage(socket, {
                msg_type: 'proposal_open_contract',
                proposal_open_contract: makeContract(trade, true),
                subscription: { id: subscription.id }
            });
        });
    }

    function settleTrade(socket, accountId, contractId) {
        const match = findTrade(contractId);
        if (!match || match.trade.status !== 'open') return match && match.trade;

        const profit = match.trade.won
            ? match.trade.payout - match.trade.stake
            : -match.trade.stake;
        let settled;
        try {
            const account = updateAccountState(accountId, function (state) {
                const trade = state.trades.find(function (item) {
                    return String(item.contract_id) === String(contractId);
                });
                if (!trade || trade.status !== 'open') return;

                trade.status = 'sold';
                trade.profit = Number(profit.toFixed(2));
                trade.settled_at = Date.now();
                state.balance = Number((state.balance + (trade.won ? trade.payout : 0)).toFixed(2));
                state.session[trade.won ? 'won' : 'lost']++;
                state.session.profit = Number((state.session.profit + trade.profit).toFixed(2));
                state.recent_outcomes.push(trade.won ? 'win' : 'loss');
            });
            settled = account.trades.find(function (item) {
                return String(item.contract_id) === String(contractId);
            });
        } catch (error) {
            console.error('Paper trade could not be settled locally.', error);
            return match.trade;
        }

        if (settled && settled.status === 'sold') {
            if (!socket) {
                window.dispatchEvent(new CustomEvent('nao:paper-trade-settled', {
                    detail: Object.assign({}, settled, getSessionSummary(accountId))
                }));
                return settled;
            }
            emitBalance(socket, accountId);
            notifySettled(socket, settled);
            window.dispatchEvent(new CustomEvent('nao:paper-trade-settled', {
                detail: Object.assign({}, settled, getSessionSummary(accountId))
            }));
        }
        return settled || match.trade;
    }

    function subscribeToTrade(socket, request, trade) {
        const id = 'paper-' + trade.contract_id;
        const items = subscriptions.get(String(trade.contract_id)) || [];
        if (!items.some(function (item) { return item.socket === socket && item.id === id; })) {
            items.push({ socket: socket, id: id });
            subscriptions.set(String(trade.contract_id), items);
        }

        sendResponse(socket, request, 'proposal_open_contract', {
            proposal_open_contract: makeContract(trade, trade.status !== 'open'),
            subscription: { id: id }
        });
        if (trade.status === 'open') {
            const delay = Math.max(0, trade.settle_at - Date.now());
            scheduleSettlement(socket, trade.account_id, trade.contract_id, delay);
        }
    }

    function createPaperTrade(socket, request, accountId) {
        const parameters = request.parameters || {};
        const currency = String(parameters.currency || 'USD').toUpperCase();
        const price = Number(request.price);
        const amount = Number(parameters.amount);
        const rawStake = parameters.basis === 'payout' ? price : (amount > 0 ? amount : price);
        const rawPayout = parameters.basis === 'payout' ? amount : rawStake * 1.9;
        const stake = Number(rawStake.toFixed(2));
        const payout = Number(rawPayout.toFixed(2));

        if (currency !== 'USD') {
            sendError(socket, request, 'buy', 'PaperTradingCurrencyUnsupported', 'Paper trading currently supports USD only.');
            return;
        }
        if (!Number.isFinite(stake) || stake <= 0 || !Number.isFinite(payout) || payout <= 0) {
            sendError(socket, request, 'buy', 'InvalidAmount', 'The paper-trade stake or payout is invalid.');
            return;
        }

        let account;
        let trade;
        try {
            account = getAccountState(accountId);
            if (stake > account.balance) {
                sendError(socket, request, 'buy', 'InsufficientBalance', 'Insufficient simulated balance.');
                return;
            }

            const now = Date.now();
            contractSequence++;
            const contractId = String(contractSequence);
            const won = chooseOutcome(accountId);
            trade = {
                contract_id: contractId,
                account_id: accountId,
                stake: Number(stake.toFixed(2)),
                payout: Number(payout.toFixed(2)),
                won: won,
                profit: 0,
                status: 'open',
                contract_type: String(parameters.contract_type || ''),
                symbol: String(parameters.symbol || ''),
                currency: currency,
                created_at: now,
                settle_at: now + getDurationMs(parameters)
            };

            account = updateAccountState(accountId, function (state) {
                state.balance = Number((state.balance - trade.stake).toFixed(2));
                state.session.trades++;
                state.trades.push(trade);
            });
        } catch (error) {
            console.error('Paper trade could not be recorded locally.', error);
            sendError(socket, request, 'buy', 'PaperTradingUnavailable', 'Paper trade could not be saved locally; no order was sent.');
            return;
        }

        syncClientAccountBalance(accountId, account.balance);
        emitBalance(socket, accountId);
        sendResponse(socket, request, 'buy', {
            buy: {
                contract_id: Number(trade.contract_id),
                buy_price: trade.stake,
                payout: trade.payout,
                currency: trade.currency,
                contract_type: trade.contract_type,
                symbol: trade.symbol,
                transaction_id: Number(trade.contract_id),
                purchase_time: Math.floor(trade.created_at / 1000),
                balance_after: account.balance,
                longcode: 'PAPER TRADE: locally simulated outcome. No Deriv order was placed.'
            }
        });

        scheduleSettlement(socket, accountId, trade.contract_id, trade.settle_at - Date.now());
    }

    function resumeOpenTrades() {
        if (!paperState) return;
        Object.keys(paperState.accounts).forEach(function (accountId) {
            const account = paperState.accounts[accountId];
            account.trades.filter(function (trade) {
                return trade.status === 'open';
            }).forEach(function (trade) {
                scheduleSettlement(null, accountId, trade.contract_id, Math.max(0, trade.settle_at - Date.now()));
            });
        });
    }

    function handlePaperRequest(socket, request, accountId) {
        if (!isPaperAccount(accountId)) return false;

        if (Object.prototype.hasOwnProperty.call(request, 'buy')) {
            createPaperTrade(socket, request, accountId);
            return true;
        }
        if (Object.prototype.hasOwnProperty.call(request, 'buy_contract_for_multiple_accounts')) {
            sendError(socket, request, 'buy_contract_for_multiple_accounts', 'PaperTradingUnsupported', 'Multi-account purchases are disabled in paper-trading mode.');
            return true;
        }

        if (Object.prototype.hasOwnProperty.call(request, 'proposal_open_contract')) {
            const match = findTrade(request.contract_id);
            if (match) {
                subscribeToTrade(socket, request, match.trade);
                return true;
            }
        }

        if (Object.prototype.hasOwnProperty.call(request, 'sell')) {
            const match = findTrade(request.sell);
            if (match) {
                const trade = settleTrade(socket, match.accountId, match.trade.contract_id);
                sendResponse(socket, request, 'sell', {
                    sell: {
                        contract_id: Number(match.trade.contract_id),
                        sold_for: trade && trade.won ? trade.payout : 0,
                        transaction_id: Number(match.trade.contract_id)
                    }
                });
                return true;
            }
        }

        if (Object.prototype.hasOwnProperty.call(request, 'forget')) {
            for (const [contractId, items] of subscriptions.entries()) {
                const remaining = items.filter(function (item) {
                    return !(item.socket === socket && item.id === request.forget);
                });
                if (remaining.length !== items.length) {
                    if (remaining.length) subscriptions.set(contractId, remaining);
                    else subscriptions.delete(contractId);
                    return true;
                }
            }
        }
        return false;
    }

    function createPaperWebSocket(url, protocols) {
        const socket = new OriginalWebSocket(url, protocols);
        const originalSend = socket.send.bind(socket);
        let authorizedAccountId = '';

        socket.addEventListener('message', function (event) {
            try {
                const message = JSON.parse(event.data);
                if (message.msg_type === 'authorize' && message.authorize && message.authorize.loginid) {
                    authorizedAccountId = message.authorize.loginid;
                }
            } catch (error) {
                console.error('Unable to inspect the WebSocket account authorization response.', error);
            }
        });

        socket.send = function (data) {
            const accountId = authorizedAccountId || localStorage.getItem('active_loginid') || '';
            if (!isPaperAccount(accountId)) return originalSend(data);

            let request;
            try {
                request = typeof data === 'string' ? JSON.parse(data) : null;
            } catch (error) {
                console.error('Blocked an unreadable WebSocket request while paper trading is active.', error);
                return;
            }
            if (!request || typeof request !== 'object') {
                console.error('Blocked an unsupported WebSocket request while paper trading is active.');
                return;
            }
            if (handlePaperRequest(socket, request, accountId)) return;
            return originalSend(data);
        };
        return socket;
    }

    createPaperWebSocket.CONNECTING = OriginalWebSocket.CONNECTING;
    createPaperWebSocket.OPEN = OriginalWebSocket.OPEN;
    createPaperWebSocket.CLOSING = OriginalWebSocket.CLOSING;
    createPaperWebSocket.CLOSED = OriginalWebSocket.CLOSED;
    createPaperWebSocket.prototype = OriginalWebSocket.prototype;
    window.WebSocket = createPaperWebSocket;
    resumeOpenTrades();

    function getSessionSummary(accountId) {
        const id = accountId || localStorage.getItem('active_loginid') || '';
        if (!isPaperAccount(id)) return null;
        try {
            const session = getAccountState(id).session;
            const resolved = session.won + session.lost;
            const profit = Number(session.profit) || 0;
            return {
                profit: (profit >= 0 ? '+' : '') + profit.toFixed(2) + ' USD',
                trades: session.trades,
                won: session.won,
                lost: session.lost,
                winRate: (resolved ? Math.round(session.won / resolved * 100) : 0) + '%'
            };
        } catch (error) {
            console.error('Unable to read the paper-trading session summary.', error);
            return null;
        }
    }

    window.NaoPaperTrading = {
        isPaperAccount: isPaperAccount,
        getSessionSummary: getSessionSummary
    };

    function updatePaperTradingBanner() {
        if (!document.body) return;
        const accountId = localStorage.getItem('active_loginid') || '';
        let banner = document.getElementById('nao-paper-trading-banner');

        if (!isPaperAccount(accountId)) {
            if (banner) banner.remove();
            return;
        }

        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'nao-paper-trading-banner';
            banner.className = 'nao-paper-trading-banner';
            banner.setAttribute('role', 'status');
            banner.textContent = 'PAPER TRADING - configured local outcomes and estimated payouts; no Deriv orders sent';
            document.body.appendChild(banner);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', updatePaperTradingBanner);
    } else {
        updatePaperTradingBanner();
    }
    setInterval(updatePaperTradingBanner, 1000);
})();
