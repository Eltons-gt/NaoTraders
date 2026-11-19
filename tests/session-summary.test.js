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
        this.id = '';
        this.className = '';
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

    get innerText() {
        return this.textContent;
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

    closest(selector) {
        return selector === '#db-animation__run-button' && this.id === 'db-animation__run-button'
            ? this
            : null;
    }

    focus() {}

    remove() {
        this.document.body.children = this.document.body.children.filter((child) => child !== this);
    }
}

function loadSummary(options = {}) {
    const document = {
        readyState: options.readyState || 'loading',
        activeElement: null,
        listeners: {},
        statTiles: [],
        mutationCallback: null,
        body: {
            children: [],
            appendChild(element) {
                this.children.push(element);
            }
        },
        addEventListener(type, listener) {
            this.listeners[type] = this.listeners[type] || [];
            this.listeners[type].push(listener);
        },
        contains(element) {
            return this.body.children.includes(element);
        },
        createElement() {
            return new FakeElement(this);
        },
        querySelector(selector) {
            if (!selector.startsWith('#')) return null;
            return this.body.children.find((element) => element.id === selector.slice(1)) || null;
        },
        querySelectorAll(selector) {
            if (selector === '.run-panel__tile') return this.statTiles;
            return [];
        }
    };
    if (options.prepareDocument) options.prepareDocument(document);
    const window = {
        location: { search: '' },
        addEventListener() {}
    };
    vm.runInNewContext(script, {
        document,
        window,
        URLSearchParams,
        MutationObserver: class {
            constructor(callback) {
                document.mutationCallback = callback;
            }

            observe() {}
        },
        console,
        setTimeout
    });
    return { api: window.NaoTradersSessionSummary, document };
}

function makeStatTiles(document, values) {
    return [
        ['No. of runs', values.trades],
        ['Contracts won', values.won],
        ['Contracts lost', values.lost],
        ['Total profit/loss', values.profit]
    ].map(([label, value]) => {
        const tile = new FakeElement(document);
        const title = new FakeElement(document);
        const content = new FakeElement(document);
        title.textContent = label;
        content.textContent = value;
        tile.childrenBySelector.set('.run-panel__tile-title', title);
        tile.childrenBySelector.set('.run-panel__tile-content', content);
        tile.content = content;
        return tile;
    });
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

test('shows the summary when the app returns from Stop controls to Run without a toast', async () => {
    const { api, document } = loadSummary({
        readyState: 'complete',
        prepareDocument(doc) {
            doc.statTiles = makeStatTiles(doc, {
                trades: 12,
                won: 8,
                lost: 4,
                profit: '50.00 USD'
            });
            const runButton = new FakeElement(doc);
            runButton.id = 'db-animation__run-button';
            runButton.textContent = 'Run';
            doc.body.appendChild(runButton);
        }
    });
    const initialRunButton = document.querySelector('#db-animation__run-button');
    document.listeners.click[0]({ target: initialRunButton });

    const pauseButton = new FakeElement(document);
    pauseButton.id = 'db-animation__pause-button';
    const stopButton = new FakeElement(document);
    stopButton.id = 'db-animation__stop-button';
    document.body.children = [pauseButton, stopButton];
    document.mutationCallback([{
        type: 'childList',
        addedNodes: [pauseButton, stopButton],
        removedNodes: [initialRunButton]
    }]);

    const endValues = {
        trades: '18',
        won: '12',
        lost: '6',
        profit: '83.32 USD'
    };
    document.statTiles.forEach((tile) => {
        const title = tile.querySelector('.run-panel__tile-title').textContent;
        const value = {
            'No. of runs': endValues.trades,
            'Contracts won': endValues.won,
            'Contracts lost': endValues.lost,
            'Total profit/loss': endValues.profit
        }[title];
        tile.content.textContent = value;
    });

    const finalRunButton = new FakeElement(document);
    finalRunButton.id = 'db-animation__run-button';
    finalRunButton.textContent = 'Run';
    document.body.children = [finalRunButton];
    document.mutationCallback([{
        type: 'childList',
        addedNodes: [finalRunButton],
        removedNodes: [pauseButton, stopButton]
    }]);
    await new Promise((resolve) => setTimeout(resolve, 250));

    const overlay = document.body.children.find((element) => element.className === 'session-summary-overlay');
    assert.ok(overlay);
    assert.equal(overlay.querySelector('.session-summary-profit').textContent, '+33.32 USD');
    assert.deepEqual(
        overlay.querySelectorAll('.session-summary-stat-value').map((item) => item.textContent),
        ['6', '4', '2', '67%']
    );
});
