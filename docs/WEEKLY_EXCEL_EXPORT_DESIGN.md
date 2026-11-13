# Weekly Customer Database Excel Export & Email System

## 1. Executive Summary & Purpose
This system provides an automated weekly recurring export of all customer leads and their associated website audit results from MongoDB into a formatted Microsoft Excel (`.xlsx`) workbook. Every Friday at 23:59 (Asia/Dhaka timezone, UTC+6), the system queries the full lifetime customer database, constructs a styled spreadsheet, and delivers it via Gmail SMTP to the administrator's email.

An on-demand CLI script (`npm run export:email`) is also provided for ad-hoc exports and testing.

---

## 2. Requirements & Understanding Summary
* **Trigger Frequency:** Every Friday night at 23:59:00 (Asia/Dhaka, UTC+6).
* **Scope of Data:** Full customer database (all leads collected to date), sorted in reverse chronological order (newest first).
* **Data Fields Included:**
  1. Submission Date (`createdAt`)
  2. Company Name (`companyName`)
  3. Website URL (`website`)
  4. Email Address (`email`)
  5. Industry (`industry`)
  6. Location (`location`)
  7. Products & Services (`productsServices`)
  8. Audit Status (`Audit.status`: `done` / `running` / `failed`)
  9. Overall AI Readiness Score (`Audit.result.overallScore`)
  10. Grade (`Audit.result.grade`: Strong, Good, Basic, Not Ready)
  11. User Report Email Sent? (`Lead.emailSent`: Yes / No)
* **Output Format:** Modern Microsoft Excel format (`.xlsx`) generated using `exceljs`, featuring branded styling (blue header row `#1E3A8A`, white text, frozen top row, borders, auto-adjusted column widths).
* **Delivery Method:** Delivered as an attachment via Nodemailer over Gmail SMTP (`technologyhome.2021@gmail.com`).
* **Recipient:** Configured via `ADMIN_REPORT_EMAIL` in `.env` (defaults to `technologyhome.2021@gmail.com`).
* **Manual Trigger:** Standalone executable script `scripts/export-leads.js` runnable via `npm run export:email`.

---

## 3. Assumptions
* **Timezone:** Asia/Dhaka (`+06:00`) is explicitly declared in `node-cron` configuration so daylight saving or server host locations (e.g. US/EU regions in Oracle Cloud) do not skew the schedule.
* **Server Runtime:** The application runs as a persistent background process via PM2 or Docker on a dedicated VM, ensuring cron jobs fire reliably without sleeping.
* **In-Memory Generation:** The Excel file is generated directly into memory (`Buffer`) using `exceljs` and attached to the email without leaving orphaned files on the server disk.
* **Empty Database Safety:** If zero records exist, the export generates a valid empty workbook with headers and dispatches an informative status email.

---

## 4. Key Risks & Mitigations

| Risk | Impact | Mitigation Strategy |
| :--- | :--- | :--- |
| **Server Crash during Cron** | Failed weekly dispatch | The scheduled job is wrapped in try/catch; errors are logged without stopping Express. PM2 auto-restarts the server on fatal exceptions. |
| **SMTP Delivery Failure** | Email not received | Errors are logged with descriptive messages; `npm run export:email` enables instant manual re-trigger. |
| **Orphaned / Missing Audits** | Crash or incomplete row | Safe navigation operators (`lead.auditId?.result?.overallScore ?? 'N/A'`) ensure leads without finished audits render safely. |
| **Memory Spike on Large DB** | OOM | `exceljs` in-memory buffer generation consumes <10MB RAM for thousands of rows, well within server limits. |

---

## 5. Complete Decision Log

| Decision Point | Selected Decision | Alternatives Considered | Rationale |
| :--- | :--- | :--- | :--- |
| **Architecture** | **Approach 1:** In-app Scheduler (`node-cron`) + CLI Runner | Approach 2: Linux OS Crontab<br>Approach 3: External Webhook | Zero OS-level setup required; completely portable across Docker, VPS, and PaaS environments. |
| **Spreadsheet Engine** | **`exceljs`** | `xlsx` (SheetJS), `csv-writer` | Supports true `.xlsx` formatting, styling (fills, font colors, borders), freeze panes, and buffer streaming. |
| **Cron Library** | **`node-cron`** | `bree`, `agenda`, `cron` | Standard, lightweight, zero-dependency cron parser with native timezone support. |
| **Recipient Configuration** | **`ADMIN_REPORT_EMAIL` (.env)** | Hardcoded string | Configurable across staging and production without modifying application code. |
| **Data Scope** | **Full Lifetime Database** | Weekly slice only | Provides complete offline customer backups in one central file per week. |

---

## 6. Component Architecture & Data Flow

```
+-------------------------------------------------------------------+
|                        MongoDB Database                           |
|                      (Leads + Audits)                             |
+---------------------------------+---------------------------------+
                                  |
                                  | Lead.find().populate('auditId')
                                  v
+---------------------------------+---------------------------------+
|                   src/services/leadExporter.js                    |
|  - Queries leads and audits                                       |
|  - Calculates summary stats (total, new this week)                |
|  - Builds styled .xlsx workbook via exceljs                       |
|  - Returns: { buffer, filename, totalCount, newThisWeek }         |
+---------------------------------+---------------------------------+
                                  |
                                  | Buffer + Filename + Stats
                                  v
+---------------------------------+---------------------------------+
|                     src/services/email.js                         |
|  - sendWeeklyLeadsExportEmail()                                   |
|  - Formats HTML notification body with stats                      |
|  - Attaches .xlsx buffer                                          |
|  - Dispatches to ADMIN_REPORT_EMAIL via Gmail SMTP                |
+---------------------------------+---------------------------------+
                                  ^
                                  | Trigger
                 +----------------+----------------+
                 |                                 |
+----------------+---------------+ +---------------+----------------+
|     src/jobs/scheduler.js      | |    scripts/export-leads.js     |
| - node-cron: '59 23 * * 5'     | | - CLI runner for manual test   |
| - Asia/Dhaka timezone          | | - npm run export:email         |
| - Started in server.js         | | - Independent DB connection    |
+--------------------------------+ +--------------------------------+
```

---

## 7. Implementation Roadmap
1. **Dependencies:** Install `exceljs` and `node-cron`.
2. **Configuration:** Add `ADMIN_REPORT_EMAIL` to `.env`, `.env.example`, and `src/config.js`.
3. **Core Exporter:** Implement `src/services/leadExporter.js` (data extraction + Excel generation).
4. **Email Dispatcher:** Add `sendWeeklyLeadsExportEmail()` to `src/services/email.js`.
5. **Scheduler:** Implement `src/jobs/scheduler.js` and initialize in `server.js`.
6. **CLI Runner:** Create `scripts/export-leads.js` and add `"export:email"` script to `package.json`.
7. **Verification & Tests:** Write `test/leadExporter.test.js`, run test suite, and perform a live test send.
