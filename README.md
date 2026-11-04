# NaoTraders

Modern algorithmic trading platform and bot runner powered by the Deriv API.

## Features

- **Automated Trading Bots**: Deploy and customize algorithmic strategies (Martingale, D'Alembert, Oscar's Grind, Accumulators, and more).
- **Strategy Builder**: Interactive visual block-based strategy editor.
- **Copy Trading & Analysis**: Real-time signals and market analysis tools.
- **Deriv OAuth 2.0 Integration**: Secure trading account authentication.

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the local server:**
   ```bash
   npm start
   ```

3. Open **http://localhost:3000** in your browser.

## Environment Variables

Configure your credentials in `.env`:

```env
VITE_DERIV_APP_ID=34wExKGcosNmrNxUVnpJ9
NEXT_PUBLIC_DERIV_APP_ID=34wExKGcosNmrNxUVnpJ9
NEXT_PUBLIC_DERIV_APP_NAME=Nao Traders
NEXT_PUBLIC_DERIV_REFERRAL_LINK=https://t.deriv.link?t=33VBNTNRX9DY
NEXT_PUBLIC_DERIV_ENV=production
NEXT_PUBLIC_DERIV_OAUTH_SCOPES=trade
```

