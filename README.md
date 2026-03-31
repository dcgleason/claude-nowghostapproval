# LinkedIn Ghostwriting Approval Tool

Write LinkedIn posts for clients, get approval via email, publish to their profiles.

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Fill in all values (see below)
```

### 3. Generate a secure ENCRYPTION_KEY
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 4. Create your account (one-time)
```bash
# Start the server, then:
curl -X POST http://localhost:3000/auth/setup \
  -H "Content-Type: application/json" \
  -d '{"email":"danny.c.gleason@gmail.com","password":"yourpassword"}'
```

### 5. Run locally
```bash
npm run dev
```

Open http://localhost:3000 → redirects to dashboard.

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Random secret for session tokens |
| `RESEND_API_KEY` | Get from resend.com |
| `LINKEDIN_CLIENT_ID` | LinkedIn Developer App |
| `LINKEDIN_CLIENT_SECRET` | LinkedIn Developer App |
| `LINKEDIN_REDIRECT_URI` | Must match LinkedIn app config exactly |
| `ENCRYPTION_KEY` | 32-byte hex (64 chars) — for encrypting LinkedIn tokens |
| `APP_URL` | Your production URL (no trailing slash) |
| `EMAIL_DOMAIN` | Domain verified in Resend |
| `DANNY_EMAIL` | Your email for notifications |

---

## LinkedIn App Setup

1. Go to https://developer.linkedin.com → Create App
2. Add products: **Sign In with LinkedIn using OpenID Connect** + **Share on LinkedIn**
3. Set OAuth redirect URL to: `https://yourdomain.com/linkedin/callback`
4. Copy Client ID and Client Secret to `.env`

---

## Deploy to Railway

1. Push to GitHub
2. New Railway project → Deploy from GitHub
3. Add PostgreSQL plugin
4. Set all environment variables
5. Done

---

## Workflow

1. **Add client** → Clients page
2. **Connect their LinkedIn** → Connect button on client card (they authorize once)
3. **Write post** → New Post, select client
4. **Send for approval** → Email sent with review link
5. **Client approves** → You get notified by email
6. **Publish** → Click "Post to LinkedIn" on approved post
