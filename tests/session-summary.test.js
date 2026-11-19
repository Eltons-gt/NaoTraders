const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const script = fs.readFileSync(
    path.join(__dirname, '..', 'static', 'js', 'session-summary.js'),
    'utf8'
);

class FakeElement {
    constructor(document) {
        this.document = document;
        this.textContent = '';
        this.listeners = {};
        this.childrenBySelector = new Map();
        this.statValues = [];
    }

    get textContent() {
        return this._textContent;
    }

    set textContent(value) {
        this._textContent = String(value);
    }

    set innerHTML(value) {
        this.markup = value;
        this.childrenBySelector.set('.session-summary-profit', new FakeElement(this.document));
        this.childrenBySelector.set('.session-summary-continue', new FakeElement(this.document));
        this.statValues = Array.from({ length: 4 }, () => new FakeElement(this.document));
    }

    querySelector(selector) {
        return this.childrenBySelector.get(selector) || null;
    }

    querySelectorAll(selector) {
        return selector === '.session-summary-stat-value' ? this.statValues : [];
    }

    setAttribute() {}

    addEventListener(type, listener) {
        this.listeners[type] = listener;
    }

    focus() {}

    remove() {
        this.document.body.children = this.document.body.children.filter((child) => child !== this);
    }
}

function loadSummary() {
    const document = {
        readyState: 'loading',
        activeElement: null,
        body: {
            children: [],
            appendChild(element) {
                this.children.push(element);
            }
        },
        addEventListener() {},
        contains(element) {
            return this.body.children.includes(element);
        },
        createElement() {
            return new FakeElement(this);
        },
        querySelectorAll() {
            return [];
        }
    };
    const window = {
        location: { search: '' },
        addEventListener() {}
    };
    vm.runInNewContext(script, {
        document,
        window,
        URLSearchParams,
        MutationObserver: class {
            observe() {}
        },
        console,
        setTimeout
    });
    return { api: window.NaoTradersSessionSummary, document };
}

test('calculates session-only trade, outcome, and profit deltas', () => {
    const { api } = loadSummary();
    const result = api.calculateDelta(
        { trades: 12, won: 8, lost: 4, profit: 50, currency: 'USD' },
        { trades: 18, won: 12, lost: 6, profit: 83.32, currency: 'USD' }
    );

    assert.deepEqual(JSON.parse(JSON.stringify(result)), {
        profit: '+33.32 USD',
        trades: 6,
        won: 4,
        lost: 2,
        winRate: '67%'
    });
});

test('rejects inconsistent dashboard counters instead of showing misleading totals', () => {
    const { api } = loadSummary();

    assert.throws(
        () => api.calculateDelta(
            { trades: 0, won: 0, lost: 0, profit: 0, currency: 'USD' },
            { trades: 2, won: 1, lost: 0, profit: 5, currency: 'USD' }
        ),
        /incomplete or inconsistent/
    );
});

test('renders supplied session values and closes the compact summary', () => {
    const { api, document } = loadSummary();
    const result = api.calculateDelta(
        { trades: 0, won: 0, lost: 0, profit: 0, currency: 'EUR' },
        { trades: 4, won: 3, lost: 1, profit: -3.5, currency: 'EUR' }
    );

    assert.equal(api.show(result), true);
    const overlay = document.body.children[0];
    assert.equal(overlay.querySelector('.session-summary-profit').textContent, '-3.50 EUR');
    assert.deepEqual(
        overlay.querySelectorAll('.session-summary-stat-value').map((item) => item.textContent),
        ['4', '3', '1', '75%']
    );

    api.close();
    assert.equal(document.body.children.length, 0);
});
