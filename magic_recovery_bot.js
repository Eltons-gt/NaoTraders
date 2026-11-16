// Magic Recovery Bot – Deriv WebSocket implementation
// ---------------------------------------------------
// This script implements the "Magic Recovery" strategy described in the
// accompanying XML file. It can be run with Node.js (v18+) or directly in a
// browser that supports WebSocket.
//
// Configuration – replace the placeholder with your own Deriv API token.
const CONFIG = {
  // Your Deriv API token (authentication). Keep it secret!
  // You can generate one in the Deriv UI → Settings → API Tokens.
  apiToken: "YOUR_DERIV_API_TOKEN",
  // Initial stake (USD)
  initialStake: 0.35,
  // Multiplier applied after a loss to recover the previous loss plus profit.
  recoveryMultiplier: 3.4,
  // Take‑Profit and Stop‑Loss limits (USD). The bot stops when either is hit.
  takeProfit: 10,
  stopLoss: 50,
  // Market and contract details
  market: "synthetic_index",
  submarket: "random_index",
  symbol: "1HZ10V", // Volatility 10 (1s)
  contractType: "DIGITOVERUNDER",
  // Digit values for Under and Over strategies
  underDigit: 7,
  overDigit: 2,
};

// ---------------------------------------------------
// Internal state (do not modify directly)
let state = {
  currentStake: CONFIG.initialStake,
  direction: "UNDER", // "UNDER" or "OVER"
  profit: 0,
  loss: 0,
  totalProfit: 0,
};

// Helper to build a WebSocket URL with the token
function getWsUrl() {
  // Deriv V3 WebSocket endpoint (public).
  // The token is passed as a query‑string parameter.
  return `wss://ws.derivws.com/websockets/v3?app_id=1089&token=${CONFIG.apiToken}`;
}

// ---------------------------------------------------
// Core bot logic
async function startBot() {
  console.log("🔧 Starting Magic Recovery bot…");
  const ws = new WebSocket(getWsUrl());

  ws.onopen = () => {
    console.log("✅ WebSocket connection opened");
    requestProposal(ws);
  };

  ws.onmessage = (msg) => {
    const data = JSON.parse(msg.data);
    // The Deriv API wraps responses inside a numeric key, e.g. { "proposal": { … } }
    const payload = data[Object.keys(data)[0]];
    handleMessage(ws, payload);
  };

  ws.onerror = (err) => {
    console.error("❌ WebSocket error:", err.message);
    // Attempt a simple reconnection after a short delay
    setTimeout(startBot, 5000);
  };

  ws.onclose = () => {
    console.warn("⚠️ WebSocket closed – restarting in 5 s");
    setTimeout(startBot, 5000);
  };
}

// ---------------------------------------------------
// Request a price proposal for the next trade
function requestProposal(ws) {
  const digit = state.direction === "UNDER" ? CONFIG.underDigit : CONFIG.overDigit;
  const request = {
    proposal: 1,
    amount: state.currentStake,
    basis: "stake",
    contract_type: CONFIG.contractType,
    currency: "USD",
    symbol: CONFIG.symbol,
    subscription: 1,
    // Digit contracts need a prediction (the digit you are betting on).
    // For "DIGITOVERUNDER" the prediction is a string like "DIGITUNDER7".
    predict: `DIGIT${state.direction}${digit}`,
  };

  ws.send(JSON.stringify(request));
}

// ---------------------------------------------------
// Process incoming messages from the server
function handleMessage(ws, msg) {
  if (msg.error) {
    console.error("❗ Server error:", msg.error.message);
    return;
  }

  if (msg.proposal) {
    // We have a price proposal – now buy the contract.
    const buy = {
      buy: 1,
      price: msg.proposal.ask_price,
      contract_id: msg.proposal.id,
    };
    ws.send(JSON.stringify(buy));
    console.log(`🛒 Buying ${state.direction} ${state.currentStake.toFixed(2)} USD @ ${msg.proposal.ask_price.toFixed(2)} USD`);
    return;
  }

  if (msg.buy) {
    // Purchase acknowledged. Wait for the contract result.
    console.log("✅ Contract bought – awaiting result…");
    return;
  }

  if (msg.proposal_open_contract) {
    const result = msg.proposal_open_contract;
    if (result.is_settleable) {
      // Contract settled – evaluate win/loss.
      const won = result.is_settleable && result.is_user_winner;
      const payout = result.payout || 0;
      const profit = payout - state.currentStake;

      console.log(won ? "🎉 WIN" : "💔 LOSS", `Payout: ${payout.toFixed(2)} USD, Profit: ${profit.toFixed(2)} USD`);

      // Update cumulative profit and check TP/SL limits.
      state.totalProfit += profit;
      if (state.totalProfit >= CONFIG.takeProfit) {
        console.log(`🏆 TAKE‑PROFIT reached (${state.totalProfit.toFixed(2)} USD). Stopping bot.`);
        ws.close();
        return;
      }
      if (state.totalProfit <= -CONFIG.stopLoss) {
        console.log(`🛑 STOP‑LOSS reached (${state.totalProfit.toFixed(2)} USD). Stopping bot.`);
        ws.close();
        return;
      }

      // Adjust stake & direction for the next round.
      if (won) {
        // Reset to initial stake and Under direction.
        state.currentStake = CONFIG.initialStake;
        state.direction = "UNDER";
      } else {
        // Apply recovery multiplier and switch direction.
        state.currentStake = parseFloat((state.currentStake * CONFIG.recoveryMultiplier).toFixed(2));
        state.direction = state.direction === "UNDER" ? "OVER" : "UNDER";
      }

      // Request the next proposal.
      requestProposal(ws);
    }
    return;
  }
}

// ---------------------------------------------------
// Entry point
if (require.main === module) {
  // Running via Node.js
  startBot();
} else {
  // In a browser environment – expose startBot globally.
  window.startMagicRecoveryBot = startBot;
}

// End of file
