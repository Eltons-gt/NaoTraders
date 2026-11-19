(function () {
    'use strict';

    const PREVIEW_SUMMARY = {
        profit: '+633.32 USD',
        trades: 6,
        won: 5,
        lost: 1
    };
    const RUN_BUTTON_SELECTOR = '#db-animation__run-button';
    const BOT_STOP_MESSAGE = /\bBot stopped\b/i;

    let overlay = null;
    let focusBeforeOpen = null;
    let runBaseline = null;
    let stopObserver = null;
    let lastRunButtonLabel = '';
    let stopSignalHandled = false;

    function parseCount(value, label) {
        const normalized = String(value).replace(/[,\u00a0\s]/g, '');
        if (!/^\d+$/.test(normalized)) {
            throw new Error('The session summary could not read ' + label + '.');
        }
        const count = Number(normalized);
        if (!Number.isSafeInteger(count)) {
            throw new Error('The session summary received an invalid ' + label + '.');
        }
        return count;
    }

    function parseMoney(value) {
        const text = String(value).replace(/[−–]/g, '-').trim();
        const amountMatch = text.replace(/,/g, '').match(/[+-]?\d+(?:\.\d+)?/);
        const currencyMatch = text.match(/\b([A-Z]{3})\b/);
        const amount = amountMatch ? Number(amountMatch[0]) : NaN;
        if (!Number.isFinite(amount) || !currencyMatch) {
            throw new Error('The session summary could not read the profit amount or currency.');
        }
        return { amount: amount, currency: currencyMatch[1] };
    }

    function normalizeStats(stats) {
        if (!stats || typeof stats !== 'object') {
            throw new Error('Session statistics are unavailable.');
        }
        const normalized = {
            trades: Number(stats.trades),
            won: Number(stats.won),
            lost: Number(stats.lost),
            profit: Number(stats.profit),
            currency: String(stats.currency || '')
        };
        if (![normalized.trades, normalized.won, normalized.lost].every(Number.isSafeInteger) ||
            normalized.trades < 0 || normalized.won < 0 || normalized.lost < 0 ||
            normalized.won + normalized.lost !== normalized.trades ||
            !Number.isFinite(normalized.profit) ||
            !/^[A-Z]{3}$/.test(normalized.currency)) {
            throw new Error('Session statistics are incomplete or inconsistent.');
        }
        return normalized;
    }

    function calculateDelta(start, end) {
        const before = normalizeStats(start);
        const after = normalizeStats(end);
        if (before.currency !== after.currency) {
            throw new Error('The account currency changed during the session.');
        }

        const trades = after.trades - before.trades;
        const won = after.won - before.won;
        const lost = after.lost - before.lost;
        const profit = Number((after.profit - before.profit).toFixed(2));
        if (trades < 0 || won < 0 || lost < 0 || won + lost !== trades) {
            throw new Error('Session statistics changed unexpectedly while the bot was stopping.');
        }

        return {
            profit: (profit > 0 ? '+' : '') + profit.toFixed(2) + ' ' + after.currency,
            trades: trades,
            won: won,
            lost: lost,
            winRate: (trades ? Math.round(won / trades * 100) : 0) + '%'
        };
    }

    function readDashboardStats() {
        const tiles = Array.from(document.querySelectorAll('.run-panel__tile'));
        function tileValue(label) {
            const tile = tiles.find(function (item) {
                const title = item.querySelector('.run-panel__tile-title');
                return title && title.textContent.trim() === label;
            });
            const value = tile && tile.querySelector('.run-panel__tile-content');
            if (!value) throw new Error('The dashboard is missing the "' + label + '" statistic.');
            return value.textContent.trim();
        }

        const profit = parseMoney(tileValue('Total profit/loss'));
        return {
            trades: parseCount(tileValue('No. of runs'), 'trade count'),
            won: parseCount(tileValue('Contracts won'), 'win count'),
            lost: parseCount(tileValue('Contracts lost'), 'loss count'),
            profit: profit.amount,
            currency: profit.currency
        };
    }

    function normalizeSummary(summary) {
        if (!summary || typeof summary !== 'object') {
            throw new Error('Session summary data was not provided.');
        }

        const profit = typeof summary.profit === 'number'
            ? { amount: summary.profit, currency: String(summary.currency || 'USD') }
            : parseMoney(summary.profit);
        return calculateDelta(
            { trades: 0, won: 0, lost: 0, profit: 0, currency: profit.currency },
            {
                trades: summary.trades,
                won: summary.won,
                lost: summary.lost,
                profit: profit.amount,
                currency: profit.currency
            }
        );
    }

    function createSummary(summary) {
        overlay = document.createElement('div');
        overlay.className = 'session-summary-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', 'session-summary-title');
        overlay.innerHTML =
            '<div class="session-summary-card">' +
                '<div class="session-summary-check" aria-hidden="true">&#10003;</div>' +
                '<p class="session-summary-label">Bot stopped</p>' +
                '<h1 class="session-summary-title" id="session-summary-title">Session profit</h1>' +
                '<p class="session-summary-subtitle">Trading session has ended.</p>' +
                '<p class="session-summary-profit"></p>' +
                '<div class="session-summary-stats">' +
                    '<div class="session-summary-stat"><span class="session-summary-stat-label">Trades</span><span class="session-summary-stat-value"></span></div>' +
                    '<div class="session-summary-stat"><span class="session-summary-stat-label">Won</span><span class="session-summary-stat-value session-summary-stat-value--won"></span></div>' +
                    '<div class="session-summary-stat"><span class="session-summary-stat-label">Lost</span><span class="session-summary-stat-value session-summary-stat-value--lost"></span></div>' +
                    '<div class="session-summary-stat"><span class="session-summary-stat-label">Win rate</span><span class="session-summary-stat-value session-summary-stat-value--rate"></span></div>' +
                '</div>' +
                '<button class="session-summary-continue" type="button">Continue</button>' +
            '</div>';

        overlay.querySelector('.session-summary-profit').textContent = summary.profit;
        const statValues = overlay.querySelectorAll('.session-summary-stat-value');
        statValues[0].textContent = summary.trades;
        statValues[1].textContent = summary.won;
        statValues[2].textContent = summary.lost;
        statValues[3].textContent = summary.winRate;
        overlay.querySelector('.session-summary-continue').addEventListener('click', closeSummary);
        overlay.addEventListener('click', function (event) {
            if (event.target === overlay) closeSummary();
        });

        focusBeforeOpen = document.activeElement;
        document.body.appendChild(overlay);
        overlay.querySelector('.session-summary-continue').focus();
    }

    function closeSummary() {
        if (!overlay) return;
        overlay.remove();
        overlay = null;
        const target = focusBeforeOpen;
        focusBeforeOpen = null;
        if (target && document.contains(target) && typeof target.focus === 'function') target.focus();
    }

    function showSummary(summary) {
        let normalized;
        try {
            normalized = normalizeSummary(summary);
        } catch (error) {
            console.error('Unable to display the session summary.', error);
            return false;
        }
        closeSummary();
        createSummary(normalized);
        return true;
    }

    function finishSession(attempt, baseline) {
        const sessionBaseline = typeof baseline === 'undefined' ? runBaseline : baseline;
        if (!sessionBaseline) {
            console.error('Unable to display the session summary because the bot start statistics were not captured.');
            return;
        }

        try {
            showSummary(calculateDelta(sessionBaseline, readDashboardStats()));
            if (runBaseline === sessionBaseline) runBaseline = null;
        } catch (error) {
            if (attempt < 4) {
                setTimeout(function () { finishSession(attempt + 1, sessionBaseline); }, 200);
                return;
            }
            console.error('Unable to calculate the completed session summary.', error);
        }
    }

    function handleStopSignal(summary) {
        if (summary) {
            if (showSummary(summary)) {
                runBaseline = null;
                stopSignalHandled = true;
                return;
            }
        }
        if (stopSignalHandled) return;
        stopSignalHandled = true;
        const sessionBaseline = runBaseline;
        setTimeout(function () { finishSession(0, sessionBaseline); }, 200);
    }

    function captureRunStart(event) {
        const target = event.target;
        const button = target && typeof target.closest === 'function'
            ? target.closest(RUN_BUTTON_SELECTOR)
            : null;
        if (!button) return;

        const label = (button.innerText || button.textContent || '').trim();
        if (!/\bRun\b/i.test(label) || /\bStop\b/i.test(label)) return;

        try {
            runBaseline = readDashboardStats();
            stopSignalHandled = false;
            lastRunButtonLabel = label;
        } catch (error) {
            runBaseline = null;
            console.error('Unable to capture statistics at bot start.', error);
        }
    }

    function checkRunButtonTransition() {
        const button = document.querySelector(RUN_BUTTON_SELECTOR);
        if (!button) return;
        const label = (button.innerText || button.textContent || '').trim();
        if (runBaseline && /\bStop\b/i.test(lastRunButtonLabel) && /\bRun\b/i.test(label)) {
            handleStopSignal();
        }
        lastRunButtonLabel = label;
    }

    function nodeContainsStopMessage(node) {
        return !!node && BOT_STOP_MESSAGE.test(String(node.textContent || node.nodeValue || ''));
    }

    function installStopObserver() {
        if (!document.body || stopObserver) return;
        stopObserver = new MutationObserver(function (records) {
            for (const record of records) {
                if (record.type === 'characterData' && nodeContainsStopMessage(record.target.parentElement)) {
                    handleStopSignal();
                    break;
                }
                if (Array.from(record.addedNodes || []).some(nodeContainsStopMessage)) {
                    handleStopSignal();
                    break;
                }
            }
            checkRunButtonTransition();
        });
        stopObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
        checkRunButtonTransition();
    }

    window.NaoTradersSessionSummary = {
        show: showSummary,
        close: closeSummary,
        calculateDelta: calculateDelta
    };

    window.addEventListener('nao:bot-stopped', function (event) {
        handleStopSignal(event.detail);
    });
    document.addEventListener('click', captureRunStart, true);
    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') closeSummary();
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', installStopObserver);
    } else {
        installStopObserver();
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get('sessionSummary') === '1') {
        const showPreview = function () { showSummary(PREVIEW_SUMMARY); };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', showPreview);
        } else {
            showPreview();
        }
    }
})();
