# AI Readiness Checker: Specification

This file is the single source of truth. Every build step must read it first. If code and this file disagree, this file wins. If something is missing here, ask the developer instead of guessing.

---

## 1. What we are building

A web tool that takes a company's website, crawls it, runs a set of checks, and gives an **AI Readiness Score** out of 100. The score shows how ready the website is to be understood and used by AI answer engines (Google AI Overviews, ChatGPT, Perplexity, Gemini).

The tool is a lead generator for a software development company. The visitor fills a form, sees the result, and can download a branded PDF report. The form data is saved as a lead.

### Honesty rule (very important)

Nobody can promise that a site will appear in AI Overviews. Google has no public API for it. So:

- The product name is **AI Readiness Score**. Never write "AI Overview probability", "chance of ranking" or any percentage that sounds like a prediction.
- The UI and the PDF must include this sentence: "This score shows how ready your website is. It cannot promise a place in Google AI Overviews or any AI answer."

### Out of scope for now

- No checks of ChatGPT, Perplexity or Gemini answers about the brand. The score depends only on the website itself.
- No user accounts, no payments, no admin panel, no email sending.
- No frontend framework. The test page is plain HTML with Bootstrap 5. It moves to the main website later.

---

## 2. Tech stack and rules

- Node.js 20 or newer, CommonJS (`require`), no TypeScript.
- Express for the API. Mongoose with MongoDB Atlas for storage.
- `cheerio` for HTML parsing, `playwright` (Chromium) for rendering and PDF, `p-limit` for concurrency, `zod` for validation, `helmet`, `cors`, `express-rate-limit`, `dotenv`.
- Gemini through the official `@google/genai` SDK. Google PageSpeed Insights API v5 for speed.
- Check the official docs of every package and API before using it. Do not guess method names.
- Never hardcode a Gemini model name. It comes from `GEMINI_MODEL`.
- Code style: 2 spaces, single quotes, async/await, small files, one job per file, comments only where the reason is not obvious.
- Every user-facing text is in English.

### Core design rules

1. **Code does the math.** Gemini only reads content and gives ratings (integers 0 to 10) and lists. The final score is calculated by `scoring.js` as plain, deterministic code. The same input must always give the same score.
2. **No single failure kills an audit.** PageSpeed failing, Gemini failing, or one page failing to load must never stop the whole job. Record a warning and go on.
3. **Never trust the outside.** The website URL, the page content, and Gemini's output are all untrusted data.
4. **Plain data between services.** Check functions return plain objects. Only `scoring.js` produces scores.

---

## 3. Environment variables

All are read and validated in `src/config.js` with zod. If a required one is missing, stop at startup with a clear message. Never print secret values.

| Name | Required | Default | Meaning |
| --- | --- | --- | --- |
| `PORT` | no | 3000 | Server port |
| `NODE_ENV` | no | development | `production` hides verbose errors |
| `MONGODB_URI` | yes | | MongoDB Atlas connection string |
| `GEMINI_API_KEY` | yes | | Key from Google AI Studio |
| `GEMINI_MODEL` | yes | | Model name, taken from Google's current model list |
| `PAGESPEED_API_KEY` | yes | | Key for PageSpeed Insights API |
| `ALLOWED_ORIGINS` | yes | | Comma list of allowed browser origins for CORS |
| `MAX_PAGES` | no | 15 | Max pages crawled per audit |
| `TURNSTILE_SECRET` | no | empty | Cloudflare Turnstile secret. Empty means skip the check (local development only) |
| `REPORT_BRAND_NAME` | no | | Company name shown in the PDF |
| `REPORT_BRAND_URL` | no | | Company website shown in the PDF |
| `REPORT_BRAND_EMAIL` | no | | Contact email shown in the PDF |

`.env` is never committed. `.env.example` lists every name with empty values.

---

## 4. Folder structure

```text
ai-readiness-checker/
  server.js
  package.json
  .env
  .env.example
  .gitignore
  .dockerignore
  Dockerfile
  DEPLOY.md
  docs/SPEC.md
  public/index.html              (test page)
  scripts/                       (try-crawl, try-pagespeed, try-gemini, try-pdf, db-test, e2e, sites.json)
  src/
    config.js
    db.js
    validators.js
    models/Lead.js
    models/Audit.js
    routes/audits.js
    jobs/runAudit.js
    services/
      urlGuard.js
      safeFetch.js
      browser.js
      crawler.js
      pagespeed.js
      gemini.js
      turnstile.js
      scoring.js
      report.js
      checks/technical.js
      checks/schema.js
      checks/structure.js
      checks/trust.js
  test/                          (node:test files, or tests next to each service)
```

---

## 5. Data models

### Lead

| Field | Type | Notes |
| --- | --- | --- |
| `companyName` | String | 2 to 120 chars |
| `website` | String | Normalized URL |
| `productsServices` | String | 3 to 500 chars |
| `industry` | String | 2 to 100 chars |
| `location` | String | 2 to 100 chars |
| `email` | String | Lowercase, trimmed |
| `consent` | Boolean | Must be true |
| `auditId` | ObjectId | Ref to Audit |
| `createdAt` | Date | |

### Audit

| Field | Type | Notes |
| --- | --- | --- |
| `leadId` | ObjectId | Ref to Lead |
| `domain` | String | Hostname without `www.`, lowercase |
| `status` | String | `queued`, `running`, `done`, `failed` |
| `progress` | Number | 0 to 100 |
| `stage` | String | Short English line, for example "Crawling pages" |
| `result` | Mixed | The result object (section 7.3) |
| `error` | String | Friendly message when failed |
| `createdAt` | Date | |
| `finishedAt` | Date | |

Index: `{ domain: 1, createdAt: -1 }`.

On server start, every Audit still `queued` or `running` is set to `failed` with the error `Server restarted`.

---

## 6. Form input and validation

The form has six fields, a consent box, and two hidden or optional extras.

| Field | Rule |
| --- | --- |
| `companyName` | Required, 2 to 120 chars |
| `website` | **Required.** Valid http(s) URL. If the scheme is missing, add `https://` |
| `productsServices` | Required, 3 to 500 chars |
| `industry` | Required, 2 to 100 chars |
| `location` | Required, 2 to 100 chars |
| `email` | Required, valid email, max 254 chars |
| `consent` | Must be `true` |
| `company_website_2` | Honeypot. Real users leave it empty |
| `turnstileToken` | Required only when `TURNSTILE_SECRET` is set |

Rules: trim every string, reject unknown keys, never pass raw request objects into Mongoose queries.

If the honeypot is filled, return a fake `202` success and do nothing else.

---

## 7. API contract

Errors always look like `{ "error": "Friendly message", "code": "SOME_CODE" }`. Never return stack traces, internal paths, keys or the user's email.

### 7.1 Endpoints

| Method and path | Request | Response |
| --- | --- | --- |
| `POST /api/audits` | The form fields | `202 { auditId, status }`. If a result for the same domain exists within 24 hours: `200 { auditId, status: "done", cached: true }` |
| `GET /api/audits/:id` | none | `{ id, status, progress, stage, companyName, website, result?, error? }` |
| `GET /api/audits/:id/pdf` | none | PDF file. `409` if the audit is not `done` |
| `GET /api/health` | none | `{ ok: true }` |

`status` is `queued`, `running`, `done` or `failed`. `progress` is 0 to 100. `result` appears only when `status` is `done`. `:id` must be a valid ObjectId, otherwise `404`.

### 7.2 Caching

- Key: the normalized domain (host, lowercase, without `www.`).
- If a `done` Audit for that domain is younger than 24 hours, create a **new** Audit document for this lead with `status: "done"` and a copy of the old `result`. A new document is needed because the company name differs per lead.
- PageSpeed results are also cached in memory for 24 hours by URL.

### 7.3 Result object

```json
{
  "overallScore": 58,
  "grade": "Basic",
  "partial": false,
  "categories": [
    {
      "key": "technical",
      "label": "Technical & Crawl Access",
      "score": 17,
      "max": 25,
      "items": [
        { "key": "ai_bot_access", "label": "AI bot access", "score": 6, "max": 6, "note": "" }
      ]
    }
  ],
  "issues": [
    {
      "severity": "high",
      "category": "schema",
      "title": "No FAQ schema",
      "why": "AI tools pick up short question and answer blocks easily.",
      "fix": "Add FAQPage JSON-LD to your services page.",
      "page": "https://example.com/services"
    }
  ],
  "questions": [
    { "question": "How much does a custom web app cost?", "answered": false, "url": null }
  ],
  "pageSpeed": { "performance": 72, "seo": 90, "accessibility": 85, "bestPractices": 92 },
  "pagesCrawled": ["https://example.com/"],
  "warnings": []
}
```

- `severity`: `high`, `medium`, `low`.
- `grade`: `Not Ready`, `Basic`, `Good`, `Strong`.
- An item that could not be measured has `score: null` and a `note` that says why.
- `pageSpeed` is `null` or `{ "error": "..." }` when it failed.
- Category keys: `technical`, `schema`, `content`, `trust`.

---

## 8. Audit pipeline

Run by `src/jobs/runAudit.js`. Global concurrency limit: 2 audits at a time. Overall timeout: 3 minutes. After the timeout, the job ends as `failed` with a friendly message.

| Progress | Stage text | Work |
| --- | --- | --- |
| 5 | Checking website | Fetch the homepage. If it cannot be opened, fail with: "We could not open this website. Please check the address." |
| 20 | Crawling pages | Crawl up to `MAX_PAGES` pages |
| 40 | Technical checks | robots.txt, sitemap, HTTPS, JavaScript gap |
| 55 | Speed test | PageSpeed Insights, mobile |
| 65 | Structure and trust checks | Schema, structure and trust checks (pure code) |
| 80 | AI content review | Gemini: `judgeContent` and `buildQuestionCoverage` run in parallel |
| 90 | Scoring | `scoring.js` |
| 100 | Done | Save the result, set `status: "done"` |

Each step has its own try/catch. A failing step adds a message to `result.warnings` and the job continues. Update `progress` and `stage` in MongoDB at every stage.

---

## 9. Crawler rules

- Use `safeFetch` for every request. The crawler never runs page JavaScript. Rendering is done only in the JavaScript-gap check.
- Start with the homepage. Collect internal links. Treat `www` and non-`www` as the same site.
- Page priority by URL path keywords: home, about, service/solution/product, contact, pricing, portfolio/case/work, faq, team, blog (max 3 posts), privacy, terms. Sitemap URLs are added at lower priority.
- Stop at `MAX_PAGES`. Skip files (pdf, images, zip, and so on), duplicate URLs and query-string duplicates.
- Concurrency 3, 10 second timeout per page. A failed page goes into `errors` and never stops the crawl.

For each page, return a plain object with: `url`, `status`, `title`, `metaDescription`, `canonical`, `lang`, `robotsMeta`, `h1[]`, `h2[]`, `h3[]`, `headingOrderOk`, `wordCount`, `mainText` (script, style, nav, footer, header and cookie banners removed, whitespace collapsed, cut to 6000 chars), `first200Words`, `listCount`, `tableCount`, `imageCount`, `imagesWithAlt`, `jsonLd[]`, `jsonLdErrors`, `internalLinks[]`, `externalLinks[]`, `hasViewport`, `ogTags`, `phones[]`, `emails[]`, `hasForm`.

---

## 10. Security rules (must follow)

### 10.1 SSRF protection

The user gives us a URL and our server fetches it. This is dangerous if not guarded.

`urlGuard.js`:

- `normalizeUrl(input)`: trim, add `https://` if there is no scheme, allow only `http` and `https`, remove credentials and the hash, lowercase the host, allow only ports 80 and 443, max length 2048.
- `assertPublicHost(hostname)`: resolve both A and AAAA records. Reject if any address is private, loopback, link-local or in a metadata range: `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `0.0.0.0/8`, `::1`, `fc00::/7`, `fe80::/10`, and IPv4-mapped IPv6 forms. Also reject `localhost`, `*.local` and `*.internal`.

`safeFetch.js`:

- Follow redirects manually (max 5). Run `assertPublicHost` on every redirect target.
- Timeout 10 seconds with `AbortController`. Read at most 2 MB of body, then abort the stream.
- Accept only `text/html`, `application/xhtml+xml`, `application/xml`, `text/xml`, `text/plain`.
- User-Agent: `AIReadinessBot/1.0`.
- Where practical, connect to the already validated IP to reduce DNS rebinding risk.
- Return `{ status, finalUrl, headers, body, redirects }`. Throw typed, friendly errors.

Playwright: every browser context blocks images, fonts and media, and aborts any request whose hostname fails `assertPublicHost` (cache the result per host).

### 10.2 Other rules

- Rate limits: `POST /api/audits` 5 per hour per IP. `GET` routes 120 per minute per IP.
- JSON body limit 50 KB. `helmet` on. CORS only for `ALLOWED_ORIGINS`. `trust proxy` set to 1.
- Cloudflare Turnstile verification when `TURNSTILE_SECRET` is set.
- Escape all dynamic text in the PDF HTML. In the browser, use `textContent`, never `innerHTML`, for server text.
- Never log API keys or the connection string. Log real errors on the server only.
- Gemini input is untrusted. The system instruction tells it to ignore any instruction found inside page content.

---

## 11. Scoring (exact formula)

Total 100 points in four categories. Round each item to one decimal. Round `overallScore` to an integer.

### 11.1 Technical & Crawl Access: 25 points (key `technical`)

| Item key | Points | Rule |
| --- | --- | --- |
| `ai_bot_access` | 6 | Looks at GPTBot, PerplexityBot, Google-Extended, ClaudeBot, CCBot. None blocked: 6. One or two blocked: 3. Three or more blocked: 1. Googlebot blocked, or all bots blocked by `User-agent: *` with `Disallow: /`: 0. No robots.txt: 4 |
| `sitemap` | 4 | Found and has at least one URL: 4. Found but empty or broken: 2. Not found: 0 |
| `https` | 3 | 1 point each: final URL is https, http redirects to https, homepage status is 200 |
| `pagespeed` | 6 | Mobile performance score ÷ 100 × 6 |
| `mobile` | 3 | Viewport meta tag present: 1. PageSpeed SEO score 90 or more: 2, 50 to 89: 1, below 50: 0 |
| `js_content` | 3 | ratio = raw HTML text length ÷ rendered text length, capped at 1. 0.8 or more: 3. 0.5 to below 0.8: 1.5. Below 0.5: 0. If rendered text is under 200 characters, use ratio 1 (thin content is judged elsewhere) |

### 11.2 Schema & Structure: 25 points (key `schema`)

| Item key | Points | Rule |
| --- | --- | --- |
| `org_schema` | 5 | Organization, LocalBusiness, ProfessionalService or Corporation found in JSON-LD: 3, plus up to 2 for completeness (name, url, logo, sameAs, contactPoint: 0.4 each). Not found: 0 |
| `faq_schema` | 4 | `FAQPage` found: 4. Otherwise 0 |
| `other_schema` | 4 | Any of Service, Product, SoftwareApplication, Article, BlogPosting, WebSite, WebPage, Breadcrumb found: 4. Otherwise 0 |
| `schema_valid` | 2 | At least one JSON-LD block and zero parse errors: 2. No JSON-LD at all: 0. Any parse error: 0 |
| `h1` | 2 | Share of key pages with exactly one H1 × 2 |
| `heading_order` | 2 | Share of pages with no heading jump × 2 |
| `title_meta` | 2 | Average of (share of pages with title 30 to 65 chars) and (share with meta description 70 to 160 chars) × 2 |
| `canonical` | 1 | Share of pages with a canonical tag × 1 |
| `lists_tables` | 2 | Share of key pages with a list or table, divided by 0.5, capped at 1, × 2 |
| `image_alt` | 1 | Share of images that have alt text × 1. No images: 1 |

Key pages are the homepage plus pages whose path suggests about, services, products, contact or pricing.

### 11.3 Content Quality: 30 points (key `content`)

Ratings come from Gemini as integers 0 to 10. Item score = rating ÷ 10 × points.

| Item key | Points | Source |
| --- | --- | --- |
| `direct_answer` | 8 | Gemini rating: does each page answer its main question in the first lines |
| `specific_facts` | 8 | Gemini rating: numbers, prices, named examples, case studies |
| `clarity` | 6 | Gemini rating: is it clear what the company does, and does it match the services the user typed |
| `question_coverage` | 4 | Questions answered ÷ questions returned × 4 (15 questions are requested) |
| `originality` | 4 | Gemini rating: original insight and freshness versus generic filler |

Rubric given to Gemini: 0 to 2 poor, 3 to 5 weak, 6 to 8 good, 9 to 10 excellent.

### 11.4 Trust & Credibility: 20 points (key `trust`)

| Item key | Points | Rule |
| --- | --- | --- |
| `about_page` | 4 | About page found: 4 |
| `contact_info` | 5 | Phone 1.5, email 1.5, physical address 1.5, contact form 0.5 |
| `team_author` | 3 | Team page, "our team" section, author bylines or Person schema found: 3 |
| `social` | 2 | Two or more social profiles (LinkedIn, Facebook, X, GitHub, YouTube, Instagram): 2. One: 1 |
| `legal_pages` | 2 | Privacy and Terms both found: 2. One: 1 |
| `social_proof` | 4 | A testimonials, reviews or case-study page or section found: 4. Only keywords in text: 2 |

### 11.5 Grade

| Score | Grade |
| --- | --- |
| 0 to 39 | Not Ready |
| 40 to 59 | Basic |
| 60 to 79 | Good |
| 80 to 100 | Strong |

### 11.6 Missing data (`partial`)

Never give free points for data that could not be measured.

- If a source fails, mark the affected items `score: null`, remove their points from the maximum, scale the rest to 100 (`overall = sum of scores ÷ sum of measured max × 100`), set `partial: true`, and add a warning.
- PageSpeed failed: `pagespeed` is not measured, and `mobile` is scored out of 1 (viewport only).
- Gemini `judgeContent` failed: `direct_answer`, `specific_facts`, `clarity`, `originality` are not measured.
- Gemini `buildQuestionCoverage` failed: `question_coverage` is not measured.

---

## 12. Issues list

For every item that lost points, build an issue from the table below.

- Severity: **high** if the item lost 60% or more of its points and its max is 5 or more. **medium** if it lost 40% or more. Otherwise **low**.
- Sort by severity (high, medium, low), then by points lost (most first). Keep the top 10.
- If the failing page is known, set `page`.
- All text is plain English that a business owner can understand.

| Item key | Title | Why it matters | Fix |
| --- | --- | --- | --- |
| `ai_bot_access` | AI bots are blocked | AI tools cannot read pages they are blocked from. | Remove the Disallow rules for GPTBot, PerplexityBot, Google-Extended, ClaudeBot and CCBot in robots.txt. |
| `sitemap` | No working sitemap | A sitemap helps bots find all your pages. | Create sitemap.xml, list your main pages and add it to robots.txt. |
| `https` | Website is not fully on HTTPS | Insecure sites lose trust and ranking. | Install an SSL certificate and redirect all http pages to https. |
| `pagespeed` | Website loads slowly on mobile | Slow pages are skipped by users and bots. | Compress images, remove unused scripts, use caching and a CDN. |
| `mobile` | Mobile setup is weak | Most visitors use phones. | Add the viewport meta tag and fix the mobile issues in the speed report. |
| `js_content` | Content is hidden behind JavaScript | Many AI bots do not run JavaScript, so they see an empty page. | Render the main text on the server (SSR or static HTML). |
| `org_schema` | Company schema is missing or incomplete | Schema tells AI who you are. | Add Organization JSON-LD with name, url, logo, sameAs and contactPoint. |
| `faq_schema` | No FAQ schema | AI tools pick up short question and answer blocks easily. | Add an FAQ section and mark it with FAQPage JSON-LD. |
| `other_schema` | No service or content schema | Schema explains what each page is about. | Add Service, WebSite or Article JSON-LD to the matching pages. |
| `schema_valid` | Schema has errors or is missing | Broken schema is ignored. | Fix the JSON-LD with a schema validator. |
| `h1` | Pages do not have exactly one H1 | The H1 tells AI the page topic. | Use one clear H1 on every page. |
| `heading_order` | Heading order is broken | A clean outline is easier to read for bots. | Use H1, H2, H3 in order without skipping levels. |
| `title_meta` | Titles or descriptions are missing or badly sized | They are the first thing search and AI tools read. | Write a title of 30 to 65 characters and a description of 70 to 160 characters for each page. |
| `canonical` | Canonical tags are missing | They prevent duplicate-page confusion. | Add a canonical link tag to every page. |
| `lists_tables` | Few lists or tables | AI likes short, structured blocks. | Use bullet lists, steps and tables for key information. |
| `image_alt` | Images are missing alt text | Alt text explains images to bots. | Add short, clear alt text to images. |
| `direct_answer` | Pages do not answer questions directly | AI quotes pages that answer in the first lines. | Start each page with a clear 2 to 3 line answer to the main question. |
| `specific_facts` | Content has few concrete facts | Numbers and examples make content worth quoting. | Add prices, numbers, named examples and case studies. |
| `clarity` | It is not clear what you offer | AI cannot recommend what it cannot understand. | State your services clearly on the homepage and services pages, using the words customers search for. |
| `question_coverage` | Customer questions are not answered | Missing answers mean missing chances to be cited. | Write pages or FAQ answers for the missing questions listed in this report. |
| `originality` | Content feels generic | AI prefers original, useful content. | Add your own experience, data and opinions. |
| `about_page` | No About page | Trust signals help AI trust you. | Add an About page with your story, team and experience. |
| `contact_info` | Contact details are incomplete | Real contact details build trust. | Show phone, email and address on the Contact page and in the footer. |
| `team_author` | No team or author information | AI looks for real people behind a site. | Add a Team page and author names on articles. |
| `social` | Few social profiles linked | Social profiles confirm your identity. | Link your LinkedIn, GitHub and other official profiles. |
| `legal_pages` | Privacy or Terms page missing | Legal pages are a basic trust sign. | Add Privacy Policy and Terms pages and link them in the footer. |
| `social_proof` | No reviews or case studies | Proof makes claims believable. | Add testimonials, reviews and case studies. |

---

## 13. Technical checks: details

### 13.1 robots.txt

Fetch `/robots.txt`. Parse the groups. For each bot in `GPTBot, ChatGPT-User, OAI-SearchBot, PerplexityBot, Google-Extended, ClaudeBot, anthropic-ai, CCBot, Googlebot, Bingbot` decide `allowed` or `blocked` for `/`.

- A specific group for the bot is used first, then `*`.
- The longest matching rule wins. `Allow` wins over `Disallow` on equal length.
- Return `{ exists, bots: { name: 'allowed' | 'blocked' }, sitemapsDeclared: [] }`.

### 13.2 Sitemap

Try the sitemaps declared in robots.txt, then `/sitemap.xml` and `/sitemap_index.xml`. Count URLs. Follow one level of sitemap index (max 3 child sitemaps). Return `{ exists, urlCount, url, urls }` where `urls` has the first 50.

### 13.3 HTTPS

Return whether the final URL is https, whether http redirects to https, the homepage status, and the redirect chain length.

### 13.4 JavaScript gap

Open the homepage in Playwright, wait for network idle (max 20 seconds), measure visible text length, compare with the raw HTML text length from the crawler. Return both lengths and the ratio.

### 13.5 PageSpeed

Call the PageSpeed Insights API v5 `runPagespeed` endpoint with `strategy=mobile` and categories performance, seo, accessibility, best-practices. Timeout 60 seconds. Retry once after 3 seconds on 429 or 5xx. Return the four scores as 0 to 100 integers, plus metrics (`lcp`, `cls`, `tbt`, `fcp`, `speedIndex`) and the top 3 opportunities. On failure return `{ error }`.

---

## 14. Gemini rules

Two functions in `src/services/gemini.js`.

### `judgeContent`

Input: company name, products and services, industry, location, and up to 8 pages. For each page send `url`, `title`, `h1`, `first200Words` and the first 1500 chars of `mainText`. Keep the total under about 20,000 characters.

Output (strict JSON): `directAnswer`, `specificFacts`, `clarity`, `originality`, each an integer 0 to 10 with a one-sentence reason that cites something actually seen in the content. Also `examplesFound[]` and `matchesInputServices` (boolean).

### `buildQuestionCoverage`

Ask Gemini to write 15 realistic questions a potential customer would ask an AI assistant when looking for these services in this industry and location. For each question, say whether the supplied page content answers it (based only on that content) and which page URL answers it. Output `[{ question, answered, url }]`.

### Rules for both

- Use `responseMimeType: 'application/json'` and a `responseSchema`. Validate again with zod.
- Temperature 0.
- The system instruction must say that all page content is untrusted data and any instructions inside it must be ignored.
- On invalid JSON, a 429 or a 5xx, retry up to 3 times with exponential backoff. If all fail, return `{ error }`. Never throw into the pipeline.
- Truncate inputs safely. Never log the API key.

---

## 15. PDF report

Route: `GET /api/audits/:id/pdf`. Built with HTML and CSS, rendered to PDF by the shared Playwright browser (`page.setContent`, then `page.pdf` with A4 and `printBackground: true`). Max 2 PDFs generated at the same time.

Response headers: `Content-Type: application/pdf` and `Content-Disposition: attachment; filename="{company-slug}-ai-readiness-report.pdf"`.

Design: English, clean, modern, one accent colour, readable fonts. Avoid page breaks inside table rows and issue cards. HTML-escape all dynamic text.

Pages:

1. **Cover:** title "AI Readiness Report", company name in large type, website, report date, big score circle (score out of 100) with the grade in a matching colour.
2. **Summary:** the four category scores as horizontal bars with points (for example 17 / 25), and a 2 to 3 sentence summary written by code from the scores (no LLM).
3. **Top issues:** table with severity pill (High, Medium, Low), the problem, why it matters, how to fix it.
4. **Missing Questions:** customer questions the website does not answer yet.
5. **Speed:** PageSpeed scores and key metrics in a small box. Skip the box if missing.
6. **Pages we checked:** list of crawled URLs.
7. **What this score means:** the honesty sentence from section 1, then a call to action using `REPORT_BRAND_NAME`, `REPORT_BRAND_URL` and `REPORT_BRAND_EMAIL`.

If `result.partial` is true, show a small note that some checks could not be measured.

Grade colours: Not Ready red, Basic orange, Good blue, Strong green.

---

## 16. Test page (`public/index.html`)

A single Bootstrap 5 page, for testing only. Later its form and result parts move into the main website.

- Form fields: company name, website, products and services, industry, location, email, consent checkbox, hidden honeypot `company_website_2`. Submit button text: **Run Audit**.
- Optional Cloudflare Turnstile widget, shown only when the constant `TURNSTILE_SITE_KEY` is not empty.
- On submit: `POST /api/audits`, then poll `GET /api/audits/:id` every 2.5 seconds.
- Show a progress bar with the stage text.
- On `done`: overall score and grade, four category bars, issues list (severity badge, title, why, fix), missing questions, PageSpeed numbers, and a **Download PDF Report** button linking to `/api/audits/:id/pdf`.
- Friendly messages for `failed`, for network errors, and for `429`.
- One constant `API_BASE` (empty string for same origin).
- Server text is always inserted with `textContent`.

---

## 17. Error messages (user-facing)

| Situation | Message |
| --- | --- |
| Website cannot be opened | We could not open this website. Please check the address. |
| Invalid URL | Please enter a valid website address. |
| Private or local address | This address cannot be checked. |
| Rate limit | Too many requests. Please wait a while and try again. |
| Audit timeout | The audit took too long. Please try again. |
| Server restart | Server restarted |
| PDF requested too early | The report is not ready yet. |
| Security check failed | Please complete the security check and try again. |
| Anything unexpected | Something went wrong. Please try again. |

---

## 18. Testing checklist

Use `node:test`.

- URL guard: private IPv4 and IPv6, localhost, credentials in URL, odd ports, redirect to a private IP, `normalizeUrl` edge cases.
- robots.txt parser: blocked bot, wildcard, allow override, missing file.
- Check functions (schema, structure, trust) with small HTML fixtures: one good site, one empty site.
- Scoring: a perfect site gives 100. An empty site gives a very low score. The same input twice gives identical output. A missing PageSpeed result scales correctly and sets `partial`.
- Turnstile verification with a mocked fetch.
- End-to-end script on five kinds of sites: static HTML, WordPress, client-rendered React or Next.js, a slow site, a site that blocks bots.
- Stability: run one site twice with the cache off. Only the Gemini-based items may differ, and by at most 1 to 2 points in total.

---

## 19. Definition of done

- The form saves a Lead in MongoDB and returns an audit id.
- An audit finishes in about 30 to 90 seconds on a normal site and always ends as `done` or `failed`.
- The same site gives the same score (Gemini items may differ by a point or two).
- No request can reach a private address.
- The PDF opens correctly and shows the company name.
- No secrets in the repo, no stack traces in responses.