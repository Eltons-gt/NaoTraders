const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

class MemoryStorage {
    constructor(entries) {
        this.entries = new Map(Object.entries(entries || {}));
    }

    getItem(key) {
        return this.entries.has(key) ? this.entries.get(key) : null;
    }

    setItem(key, value) {
        this.entries.set(key, String(value));
    }

    removeItem(key) {
        this.entries.delete(key);
    }

    clear() {
        this.entries.clear();
    }
}

class TestMessageEvent {
    constructor(type, options) {
        this.type = type;
        this.data = options.data;
    }
}

class TestCustomEvent {
    constructor(type, options) {
        this.type = type;
        this.detail = options.detail;
    }
}

class FakeWebSocket {
    constructor() {
        this.readyState = FakeWebSocket.OPEN;
        this.sent = [];
        this.listeners = new Map();
    }

    send(data) {
        this.sent.push(data);
    }

    addEventListener(type, listener) {
        const listeners = this.listeners.get(type) || [];
        listeners.push(listener);
        this.listeners.set(type, listeners);
    }

    dispatchEvent(event) {
        for (const listener of this.listeners.get(event.type) || []) {
            listener.call(this, event);
        }
        return true;
    }
}

FakeWebSocket.CONNECTING = 0;
FakeWebSocket.OPEN = 1;
FakeWebSocket.CLOSING = 2;
FakeWebSocket.CLOSED = 3;

function createHarness(accountId, winRate, existingStorage) {
    const storage = existingStorage || new MemoryStorage({
        active_loginid: accountId,
        mock_trade_settings_v1: JSON.stringify({
            win_rate: winRate,
            max_consecutive_wins: 5,
            max_consecutive_losses: 4
        })
    });
    const windowListeners = new Map();
    const pendingTimeouts = new Set();
    const document = {
        readyState: 'complete',
        body: {
            children: [],
            appendChild(element) {
                element.parentNode = this;
                this.children.push(element);
            }
        },
        getElementById(id) {
            return this.body.children.find((element) => element.id === id) || null;
        },
        createElement() {
            return {
                style: {},
                setAttribute() {},
                remove() {
                    if (this.parentNode) {
                        this.parentNode.children = this.parentNode.children.filter((item) => item !== this);
                    }
                }
            };
        },
        querySelectorAll() {
            return [];
        },
        addEventListener() {}
    };
    const window = {
        WebSocket: FakeWebSocket,
        addEventListener(type, listener) {
            const listeners = windowListeners.get(type) || [];
            listeners.push(listener);
            windowListeners.set(type, listeners);
        },
        dispatchEvent(event) {
            for (const listener of windowListeners.get(event.type) || []) listener(event);
            return true;
        }
    };
    function scheduleTimeout(callback, delay) {
        let timer;
        timer = setTimeout(() => {
            pendingTimeouts.delete(timer);
            callback();
        }, delay);
        pendingTimeouts.add(timer);
        return timer;
    }
    const context = vm.createContext({
        window,
        document,
        localStorage: storage,
        MessageEvent: TestMessageEvent,
        CustomEvent: TestCustomEvent,
        setTimeout: scheduleTimeout,
        clearTimeout(timer) {
            pendingTimeouts.delete(timer);
            clearTimeout(timer);
        },
        setInterval() {
            return 1;
        },
        console
    });

    for (const file of ['scripts/dashboard.js', 'scripts/paper-trading.js']) {
        const source = fs.readFileSync(path.join(root, file), 'utf8');
        vm.runInContext(source, context, { filename: file });
    }

    return {
        storage,
        window,
        pendingTimeouts,
        socket: new window.WebSocket('wss://test.invalid')
    };
}

function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

test('paper buys are local, settle locally, and update the simulated balance', async () => {
    const { socket, storage, window } = createHarness('ROT91160344', 100);
    const messages = [];
    socket.addEventListener('message', (event) => messages.push(JSON.parse(event.data)));

    socket.send(JSON.stringify({
        req_id: 1,
        buy: '1',
        price: 10,
        parameters: {
            amount: 10,
            basis: 'stake',
            contract_type: 'CALL',
            currency: 'USD',
            duration: 1,
            duration_unit: 't',
            symbol: 'R_100'
        }
    }));

    assert.equal(socket.sent.length, 0, 'purchase must not reach Deriv');
    await wait(10);

    const buy = messages.find((message) => message.msg_type === 'buy');
    assert.ok(buy && buy.buy.contract_id);
    const contractId = buy.buy.contract_id;
    assert.equal(buy.buy.longcode.includes('No Deriv order was placed'), true);
    assert.equal(
        messages.find((message) => message.msg_type === 'balance').balance.balance,
        290
    );

    socket.send(JSON.stringify({
        req_id: 2,
        proposal_open_contract: 1,
        contract_id: contractId,
        subscribe: 1
    }));
    assert.equal(socket.sent.length, 0, 'paper contract subscriptions must remain local');
    await wait(20);

    const open = messages.find((message) =>
        message.msg_type === 'proposal_open_contract' &&
        message.proposal_open_contract.status === 'open'
    );
    assert.ok(open);

    await wait(1050);

    const closed = messages.find((message) =>
        message.msg_type === 'proposal_open_contract' &&
        message.proposal_open_contract.status === 'sold'
    );
    assert.ok(closed);
    assert.equal(closed.proposal_open_contract.profit, 9);
    assert.equal(
        messages.filter((message) => message.msg_type === 'balance').at(-1).balance.balance,
        309
    );

    const account = JSON.parse(storage.getItem('nao_paper_trading_state_v1')).accounts['ROT91160344'];
    assert.equal(account.balance, 309);
    assert.equal(account.session.trades, 1);
    assert.equal(account.session.won, 1);
    assert.equal(account.session.lost, 0);
    assert.deepEqual(
        JSON.parse(JSON.stringify(window.NaoPaperTrading.getSessionSummary())),
        { profit: '+9.00 USD', trades: 1, won: 1, lost: 0, winRate: '100%' }
    );

    const refreshedStorage = new MemoryStorage(Object.fromEntries(storage.entries));
    const refreshed = createHarness('ROT91160344', 100, refreshedStorage);
    const refreshedMessages = [];
    refreshed.socket.addEventListener('message', (event) => refreshedMessages.push(JSON.parse(event.data)));
    refreshed.socket.dispatchEvent(new TestMessageEvent('message', {
        data: JSON.stringify({
            msg_type: 'balance',
            balance: { balance: 0, loginid: 'ROT91160344' }
        })
    }));
    assert.equal(refreshedMessages[0].balance.balance, 309);

    refreshedStorage.clear();
    assert.ok(refreshedStorage.getItem('nao_paper_trading_state_v1'));
});

test('insufficient simulated funds reject locally without submitting a buy', async () => {
    const { socket, storage } = createHarness('ROT91160344', 0);
    const messages = [];
    socket.addEventListener('message', (event) => messages.push(JSON.parse(event.data)));

    socket.send(JSON.stringify({
        req_id: 3,
        buy: '1',
        price: 301,
        parameters: { amount: 301, basis: 'stake', currency: 'USD' }
    }));
    await wait(10);

    assert.equal(socket.sent.length, 0);
    assert.equal(messages.find((message) => message.msg_type === 'buy').error.code, 'InsufficientBalance');
    assert.equal(storage.getItem('nao_paper_trading_state_v1'), null);
});

test('non-paper accounts keep their existing WebSocket purchase behavior', () => {
    const { socket } = createHarness('CR00000000', 80);
    const request = JSON.stringify({ req_id: 4, buy: '1', price: 1 });
    socket.send(request);
    assert.deepEqual(socket.sent, [request]);
});

test('paper accounts can still request read-only proposals', () => {
    const { socket } = createHarness('ROT91160344', 80);
    const request = JSON.stringify({
        req_id: 8,
        proposal: 1,
        amount: 1,
        basis: 'stake',
        contract_type: 'CALL',
        currency: 'USD',
        duration: 1,
        duration_unit: 't',
        symbol: 'R_100'
    });

    socket.send(request);
    assert.deepEqual(socket.sent, [request]);
});

test('demo accounts with overridden balances also stay in local paper mode', async () => {
    const { socket, storage } = createHarness('VRTC123456', 100);
    const messages = [];
    socket.addEventListener('message', (event) => messages.push(JSON.parse(event.data)));

    socket.send(JSON.stringify({
        req_id: 6,
        buy: '1',
        price: 10,
        parameters: { amount: 10, basis: 'stake', currency: 'USD', duration: 1, duration_unit: 't' }
    }));
    await wait(10);

    assert.equal(socket.sent.length, 0);
    assert.ok(messages.some((message) => message.msg_type === 'buy'));
    const account = JSON.parse(storage.getItem('nao_paper_trading_state_v1')).accounts['VRTC123456'];
    assert.equal(account.balance, 9990);
});

test('an already-authorized paper account remains protected after the active account changes', () => {
    const { socket } = createHarness('CR00000000', 80);
    socket.dispatchEvent(new TestMessageEvent('message', {
        data: JSON.stringify({
            msg_type: 'authorize',
            authorize: { loginid: 'ROT91160344', balance: 12 }
        })
    }));

    socket.send(JSON.stringify({ req_id: 7, buy: '1', price: 1 }));
    assert.equal(socket.sent.length, 0);
});

test('multi-account purchases are blocked in paper mode', async () => {
    const { socket } = createHarness('ROT91160344', 80);
    const messages = [];
    socket.addEventListener('message', (event) => messages.push(JSON.parse(event.data)));

    socket.send(JSON.stringify({
        req_id: 5,
        buy_contract_for_multiple_accounts: '1',
        price: 1,
        tokens: ['not-used']
    }));
    await wait(10);

    assert.equal(socket.sent.length, 0);
    assert.equal(
        messages.find((message) => message.msg_type === 'buy_contract_for_multiple_accounts').error.code,
        'PaperTradingUnsupported'
    );
});

test('removing the active account during reconnect does not reset its paper balance', async () => {
    const account = {
        balance: 123,
        session: { trades: 2, won: 1, lost: 1, profit: 4 },
        recent_outcomes: ['win', 'loss'],
        trades: []
    };
    const storage = new MemoryStorage({
        active_loginid: 'ROT91160344',
        mock_trade_settings_v1: JSON.stringify({ win_rate: 80 }),
        nao_paper_trading_state_v1: JSON.stringify({
            version: 1,
            accounts: { ROT91160344: account }
        })
    });
    const harness = createHarness('ROT91160344', 80, storage);

    storage.removeItem('active_loginid');
    await wait(10);

    assert.equal(
        JSON.parse(storage.getItem('nao_paper_trading_state_v1')).accounts.ROT91160344.balance,
        123
    );
    assert.equal(harness.pendingTimeouts.size, 0);
});

test('explicit logout resets only that account and cancels its open settlement timer', () => {
    const accountId = 'ROT91160344';
    const storage = new MemoryStorage({
        active_loginid: accountId,
        authToken: 'test-token',
        mock_trade_settings_v1: JSON.stringify({ win_rate: 80 }),
        nao_paper_trading_state_v1: JSON.stringify({
            version: 1,
            accounts: {
                ROT91160344: {
                    balance: 290,
                    session: { trades: 1, won: 0, lost: 0, profit: 0 },
                    recent_outcomes: [],
                    trades: [{
                        contract_id: '123',
                        account_id: accountId,
                        stake: 10,
                        payout: 19,
                        won: true,
                        profit: 0,
                        status: 'open',
                        contract_type: 'CALL',
                        symbol: 'R_100',
                        currency: 'USD',
                        created_at: Date.now(),
                        settle_at: Date.now() + 60000
                    }]
                },
                VRTC123456: {
                    balance: 7654,
                    session: { trades: 0, won: 0, lost: 0, profit: 0 },
                    recent_outcomes: [],
                    trades: []
                }
            }
        })
    });
    const { storage: testStorage, window, pendingTimeouts } = createHarness(accountId, 80, storage);

    testStorage.removeItem('active_loginid');
    testStorage.removeItem('authToken');

    const state = JSON.parse(testStorage.getItem('nao_paper_trading_state_v1'));
    assert.equal(state.accounts.ROT91160344, undefined);
    assert.equal(state.accounts.VRTC123456.balance, 7654);
    assert.deepEqual(
        JSON.parse(JSON.stringify(window.NaoPaperTrading.getSessionSummary(accountId))),
        { profit: '+0.00 USD', trades: 0, won: 0, lost: 0, winRate: '0%' }
    );
    assert.equal(pendingTimeouts.size, 0);
});

test('explicit logout also resets the account when auth storage is cleared first', () => {
    const accountId = 'ROT91160344';
    const storage = new MemoryStorage({
        active_loginid: accountId,
        authToken: 'test-token',
        mock_trade_settings_v1: JSON.stringify({ win_rate: 80 }),
        nao_paper_trading_state_v1: JSON.stringify({
            version: 1,
            accounts: {
                ROT91160344: {
                    balance: 150,
                    session: { trades: 1, won: 0, lost: 1, profit: -10 },
                    recent_outcomes: ['loss'],
                    trades: []
                }
            }
        })
    });
    const { storage: testStorage, pendingTimeouts } = createHarness(accountId, 80, storage);

    testStorage.removeItem('authToken');
    testStorage.removeItem('active_loginid');

    assert.equal(
        JSON.parse(testStorage.getItem('nao_paper_trading_state_v1')).accounts.ROT91160344,
        undefined
    );
    assert.equal(pendingTimeouts.size, 0);
});
