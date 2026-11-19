(function () {
    'use strict';

    const PREVIEW_SUMMARY = {
        profit: '+633.32 USD',
        trades: 6,
        won: 5,
        lost: 1,
        winRate: '83%'
    };

    let overlay = null;

    function createSummary(summary) {
        const values = summary || {
            profit: '0.00 USD',
            trades: 0,
            won: 0,
            lost: 0,
            winRate: '0%'
        };

        overlay = document.createElement('div');
        overlay.className = 'session-summary-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', 'Session profit');
        overlay.innerHTML =
            '<div class="session-summary-card">' +
                '<div class="session-summary-check" aria-hidden="true">&#10003;</div>' +
                '<p class="session-summary-label">Bot stopped</p>' +
                '<h1 class="session-summary-title">Session profit</h1>' +
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

        overlay.querySelector('.session-summary-profit').textContent = values.profit;

        const statValues = overlay.querySelectorAll('.session-summary-stat-value');
        statValues[0].textContent = values.trades;
        statValues[1].textContent = values.won;
        statValues[2].textContent = values.lost;
        statValues[3].textContent = values.winRate;

        overlay.querySelector('.session-summary-continue').addEventListener('click', closeSummary);
        overlay.addEventListener('click', function (event) {
            if (event.target === overlay) closeSummary();
        });

        document.body.appendChild(overlay);
        overlay.querySelector('.session-summary-continue').focus();
    }

    function closeSummary() {
        if (!overlay) return;
        overlay.remove();
        overlay = null;
    }

    window.NaoTradersSessionSummary = {
        show: function (summary) {
            closeSummary();
            createSummary(summary || {
                profit: '0.00 USD',
                trades: 0,
                won: 0,
                lost: 0,
                winRate: '0%'
            });
        },
        close: closeSummary
    };

    window.addEventListener('nao:bot-stopped', function (event) {
        const paperSummary = window.NaoPaperTrading
            ? window.NaoPaperTrading.getSessionSummary()
            : null;
        window.NaoTradersSessionSummary.show(event.detail || paperSummary);
    });

    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') closeSummary();
    });

    const params = new URLSearchParams(window.location.search);
    if (params.get('sessionSummary') === '1') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function () {
                createSummary(PREVIEW_SUMMARY);
            });
        } else {
            createSummary(PREVIEW_SUMMARY);
        }
    }
})();
