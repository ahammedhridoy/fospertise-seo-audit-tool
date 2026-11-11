const fs = require('fs');
const path = require('path');
const { generatePdf, getCompanySlug } = require('../src/services/report');
const { closeBrowser } = require('../src/services/browser');

async function main() {
  const sampleLead = {
    companyName: 'Acme Web Innovations',
    website: 'https://acme-innovations.example.com',
    productsServices: 'Custom web application development, Cloud architecture, API design',
    industry: 'Software Development',
    location: 'London, UK',
    email: 'hello@acme-innovations.example.com'
  };

  const sampleAudit = {
    domain: 'acme-innovations.example.com',
    status: 'done',
    progress: 100,
    stage: 'Done',
    createdAt: new Date(),
    finishedAt: new Date(),
    result: {
      overallScore: 78,
      grade: 'Good',
      partial: false,
      categories: [
        {
          key: 'technical',
          label: 'Technical & Crawl Access',
          score: 22,
          max: 25,
          items: [
            { key: 'ai_bot_access', label: 'AI bot access', score: 6, max: 6, note: '' },
            { key: 'sitemap_declared', label: 'Sitemap declared & accessible', score: 4, max: 4, note: '' },
            { key: 'https_clean', label: 'HTTPS & clean redirects', score: 5, max: 5, note: '' },
            { key: 'ssr_content', label: 'Server-rendered content vs client-only', score: 4, max: 5, note: '' },
            { key: 'mobile_pagespeed', label: 'Mobile performance & Core Web Vitals', score: 3, max: 5, note: '' }
          ]
        },
        {
          key: 'schema',
          label: 'Schema & Structured Data',
          score: 18,
          max: 25,
          items: [
            { key: 'organization_schema', label: 'Organization / Business schema', score: 8, max: 8, note: '' },
            { key: 'faq_page_schema', label: 'FAQPage schema', score: 0, max: 5, note: 'No FAQPage schema detected' },
            { key: 'service_schema', label: 'Service / Product / WebSite schema', score: 5, max: 5, note: '' },
            { key: 'breadcrumb_schema', label: 'BreadcrumbList schema', score: 3, max: 3, note: '' },
            { key: 'valid_jsonld', label: 'Valid JSON-LD without syntax errors', score: 2, max: 4, note: '' }
          ]
        },
        {
          key: 'content',
          label: 'Content Quality & AI Answers',
          score: 20,
          max: 25,
          items: [
            { key: 'direct_answer', label: 'Direct, prominent answers', score: 5, max: 6, note: '' },
            { key: 'specific_facts', label: 'Specific data points & figures', score: 4, max: 5, note: '' },
            { key: 'clarity_services', label: 'Clarity of core offerings', score: 5, max: 5, note: '' },
            { key: 'originality', label: 'Original insights vs generic copy', score: 3, max: 4, note: '' },
            { key: 'question_coverage', label: 'Customer question coverage', score: 3, max: 5, note: '' }
          ]
        },
        {
          key: 'trust',
          label: 'Trust & Business Identity',
          score: 18,
          max: 25,
          items: [
            { key: 'identity_pages', label: 'About & Contact pages', score: 6, max: 6, note: '' },
            { key: 'contact_channels', label: 'Direct contact info (phone/email/address)', score: 3, max: 5, note: '' },
            { key: 'team_authors', label: 'Team members / author bylines', score: 3, max: 5, note: '' },
            { key: 'social_presence', label: 'Social profiles & external footprints', score: 4, max: 4, note: '' },
            { key: 'trust_evidence', label: 'Case studies & testimonials', score: 2, max: 5, note: '' }
          ]
        }
      ],
      issues: [
        {
          severity: 'high',
          category: 'schema',
          title: 'No FAQ schema found on key pages',
          why: 'AI search engines frequently extract concise, structured Q&A pairs directly into AI answers and Overviews.',
          fix: 'Implement FAQPage JSON-LD schema on your services and pricing pages to answer common client queries directly.',
          page: 'https://acme-innovations.example.com/services'
        },
        {
          severity: 'medium',
          category: 'content',
          title: 'Vague service descriptions without quantitative facts',
          why: 'AI models prefer concrete data (project turnaround times, team sizes, technology versions) over broad marketing claims.',
          fix: 'Add specific numbers, technology stacks, and quantified client outcomes to your primary service pages.',
          page: 'https://acme-innovations.example.com/about'
        },
        {
          severity: 'low',
          category: 'technical',
          title: 'Missing image alt text on portfolio items',
          why: 'Descriptive alt attributes allow multimodal AI models to accurately understand and index visual proof of your work.',
          fix: 'Add descriptive alt text to all project screenshots and gallery images.',
          page: 'https://acme-innovations.example.com/portfolio'
        }
      ],
      questions: [
        { question: 'What software development frameworks does Acme use?', answered: true, url: 'https://acme-innovations.example.com/services' },
        { question: 'Where is Acme Web Innovations located?', answered: true, url: 'https://acme-innovations.example.com/contact' },
        { question: 'How much does a typical custom web app project cost?', answered: false, url: null },
        { question: 'What is Acme’s typical project timeline for an MVP?', answered: false, url: null },
        { question: 'Do you offer ongoing post-launch maintenance contracts?', answered: false, url: null }
      ],
      pageSpeed: {
        performance: 74,
        seo: 92,
        accessibility: 88,
        bestPractices: 95,
        metrics: {
          lcp: '2.4 s',
          cls: '0.04',
          tbt: '180 ms',
          fcp: '1.2 s',
          speedIndex: '2.1 s'
        },
        opportunities: []
      },
      pagesCrawled: [
        'https://www.ytseo.co/',
        'https://www.ytseo.co/about',
        'https://www.ytseo.co/contact',
        'https://www.ytseo.co/blog',
        'https://www.ytseo.co/blog/do-youtube-tags-still-matter',
        'https://www.ytseo.co/blog/youtube-seo-checklist-for-new-channels',
        'https://www.ytseo.co/blog/vidiq-vs-tubebuddy-for-small-channels',
        'https://www.ytseo.co/privacy-policy',
        'https://www.ytseo.co/terms-and-conditions',
        'https://www.ytseo.co/free-tools',
        'https://www.ytseo.co/tools/youtube-seo-for-gaming',
        'https://www.ytseo.co/tools/youtube-seo-for-walkthroughs',
        'https://www.ytseo.co/tools/youtube-seo-for-vtubers',
        'https://www.ytseo.co/tools/youtube-seo-for-streamers',
        'https://www.ytseo.co/tools/youtube-title-generator'
      ],
      warnings: []
    }
  };

  console.log('Generating sample PDF report for:', sampleLead.companyName);
  const pdfBuffer = await generatePdf(sampleAudit, sampleLead);

  const slug = getCompanySlug(sampleLead.companyName);
  const outputPath = path.resolve(__dirname, `../${slug}-ai-readiness-report.pdf`);
  fs.writeFileSync(outputPath, pdfBuffer);

  const stats = fs.statSync(outputPath);
  console.log(`\nSuccess! PDF generated and saved.`);
  console.log(`File path: ${outputPath}`);
  console.log(`File size: ${(stats.size / 1024).toFixed(1)} KB (${stats.size} bytes)`);

  await closeBrowser();
}

main().catch(async (err) => {
  console.error('Error generating PDF:', err);
  await closeBrowser();
  process.exit(1);
});
