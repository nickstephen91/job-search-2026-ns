# Nick Stephen — Job Search Agent 2026

Automated daily job search that runs every morning at 6:00 AM ET and emails a digest of new listings matching Nick's profile.

## How It Works

1. GitHub Actions triggers at 6:00 AM ET every day
2. Claude searches live job boards for matching roles
3. New listings (not seen before) are identified
4. A formatted email digest is sent to nicholasstephen@outlook.com
5. Results are saved to `results/jobs.json` for tracking

## Target Profile

- **Roles:** Director/VP Alliances, Partnerships, Channel Sales, Customer Success, RevOps, Account Management
- **Industries:** HR Tech, Compliance SaaS, PEO, Payroll Tech, B2B SaaS
- **Comp:** $130,000 – $400,000
- **Location:** Remote preferred

## Required Secrets

| Secret | Description |
|--------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude |
| `SENDER_EMAIL` | Gmail address to send from |
| `GMAIL_APP_PASSWORD` | Gmail app password (16 chars) |
| `RECIPIENT_EMAIL` | Where to send the digest |

## Manual Trigger

Go to **Actions** → **Daily Job Search** → **Run workflow** to trigger manually at any time.

## Results

- `results/jobs.json` — All tracked jobs (rolling history)
- `results/today.json` — Today's new listings (overwritten daily)
