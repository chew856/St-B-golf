# AWS cost estimate for St. Boniface (700 members, 150 public golfers)

Prices: AWS's official price lists for the **Canada (Central), Montreal** region, published November 20, 2026,
in **US dollars**. They are the same price lists the AWS Pricing Calculator uses. Taxes are not included. AWS
changes prices from time to time.

## Short answer
| Setup | Busy month (May to Sept) | Quiet month (Nov to Mar) | A full year |
|---|---|---|---|
| **A. Pay-per-use** (DynamoDB, recommended) | about **$13** | about **$2.50** | about **$95 to $130** |
| **B. Always-on database** (small Postgres server) | about **$27** | about **$17** | about **$280 to $300** |
| B with a standby copy (Multi-AZ) | about **$40** | about **$30** | about **$430** |

Add about $1 to $3 a month for logs and monitoring (CloudWatch, not priced here).

**After a season of data:** about 0.3 to 0.5 GB. DynamoDB stores the first 25 GB free, so the data itself costs **$0**,
even after many seasons. Only the backup copy costs anything (about $0.11 a month).

## Setup A, busy month in detail
| Piece | What it does | Price used | Cost |
|---|---|---|---|
| API Gateway (HTTP API) | Every request from the sites | $1.11 per million | $3.33 |
| Lambda (ARM, 256 MB) | The server code | $0.20 per million requests + $0.0000133 per GB-second | $1.60 |
| DynamoDB on-demand | Reads and writes | $0.1375 per million reads, $0.6875 per million writes | $2.48 |
| DynamoDB storage | All the club's data | first 25 GB free, then $0.275 per GB | $0.00 |
| Point-in-time backup | Restore to any second in the last 35 days | $0.22 per GB | $0.11 |
| API Gateway WebSocket | Live updates: tee sheet on every staff screen, scoring together on the course | $0.275 per million connection minutes, $1.10 per million messages | $4.68 |
| S3 | Files (PDFs, photos) | $0.025 per GB | $0.12 |
| SES | Emails (statements, confirmations, notices) | $0.10 per 1,000 | $0.80 |
| Cognito | Member and public logins | free up to 10,000 active users a month | $0.00 |
| **Total** | | | **$13.12** |

Lambda's permanent free allowance (1 million requests and 400,000 GB-seconds a month) would make the Lambda line
about $0, so the real bill may be a little lower.

## Setup B, always-on Postgres
- db.t4g.micro, Single-AZ: $0.018 an hour, about $13.14 a month. 20 GB of storage: $0.127 per GB, $2.54. **About $15.70 a month.**
- The same with Multi-AZ (a standby copy that takes over if one fails): about **$28.10 a month**.
- It runs all year, even in winter, so it costs more than Setup A for a club this size.

## Assumptions (busy month)
- 3 million requests a month: about 400 members and public golfers using the portal on a busy day, plus 10 to 15 staff
  screens (tee sheet, tills, dining) open all day.
- Each request reads about 5 small records; about 1 in 10 requests writes something.
- Live updates: 15 staff screens and about 150 groups a day with phones connected while they play.
- About 8,000 emails a month. Text messages (SMS) are not included: they cost a few cents each.
- Quiet months: about a fifth of the busy-month traffic.

## Not included
- **Website hosting.** Vercel's Pro plan for a business is about $20 a month. AWS Amplify hosting would cost a few
  dollars a month instead.
- **Building the server side** (accounts, security, moving data off each device) and someone to look after it. This is
  the real cost; AWS itself stays small.
- Text messages, a payment processor's fees, and a custom domain name (about $15 a year).
