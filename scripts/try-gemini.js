const { judgeContent, buildQuestionCoverage } = require('../src/services/gemini');

const sampleCompany = {
  companyName: 'Acme Web Engineering',
  productsServices: 'Custom Node.js and React web applications, API integrations, cloud architecture',
  industry: 'Software Development',
  location: 'San Francisco, CA',
  pages: [
    {
      url: 'https://acme-web.example.com/',
      title: 'Acme Web Engineering | Custom Full-Stack Solutions',
      h1: ['High-Performance Web Applications Built for Growth'],
      first200Words:
        'Acme Web Engineering designs and builds scalable, production-grade web systems in San Francisco. ' +
        'Since 2019, our senior engineering team has delivered over 45 custom applications for startups and enterprise clients. ' +
        'Our project engagements typically start at $15,000 with a standard 8-week delivery timeframe.',
      mainText:
        'Acme Web Engineering designs and builds scalable, production-grade web systems in San Francisco. ' +
        'Since 2019, our senior engineering team has delivered over 45 custom applications for startups and enterprise clients. ' +
        'Our project engagements typically start at $15,000 with a standard 8-week delivery timeframe. ' +
        'We specialize in TypeScript, Node.js, Next.js, and automated CI/CD cloud infrastructure on AWS. ' +
        'Case Study: We helped FinTech Global reduce API latency by 68% while handling 10M daily transactions.'
    },
    {
      url: 'https://acme-web.example.com/services',
      title: 'Services & Architecture Consulting | Acme',
      h1: ['Engineering Services & Technical Stack'],
      first200Words:
        'We offer end-to-end software development including technical scoping, frontend design in React, ' +
        'secure backend services in Node.js/Go, database optimization, and Kubernetes deployment.',
      mainText:
        'We offer end-to-end software development including technical scoping, frontend design in React, ' +
        'secure backend services in Node.js/Go, database optimization, and Kubernetes deployment. ' +
        'All client projects include automated test suites with over 90% code coverage, dedicated technical documentation, ' +
        'and 30 days of post-launch hypercare support.'
    },
    {
      url: 'https://acme-web.example.com/contact',
      title: 'Contact Engineering Team | Acme San Francisco',
      h1: ['Schedule an Architecture Consultation'],
      first200Words:
        'Ready to discuss your project? Reach out to our engineering partners at hello@acme-web.example.com ' +
        'or call our San Francisco office at +1 (415) 555-0142. Office: 450 Mission Street, Suite 800, San Francisco, CA 94105.',
      mainText:
        'Ready to discuss your project? Reach out to our engineering partners at hello@acme-web.example.com ' +
        'or call our San Francisco office at +1 (415) 555-0142. Office: 450 Mission Street, Suite 800, San Francisco, CA 94105. ' +
        'We reply to all inquiries within one business day.'
    }
  ]
};

async function main() {
  console.log('='.repeat(65));
  console.log('  Testing Gemini Services (judgeContent & buildQuestionCoverage)');
  console.log('='.repeat(65));

  console.log(`\nCompany: ${sampleCompany.companyName}`);
  console.log(`Services: ${sampleCompany.productsServices}`);
  console.log(`Pages provided: ${sampleCompany.pages.length}\n`);

  // 1. Test judgeContent
  console.log('--- 1. Running judgeContent ---');
  const judgeStart = Date.now();
  const judgeResult = await judgeContent(sampleCompany);
  console.log(`Completed in ${((Date.now() - judgeStart) / 1000).toFixed(1)}s\n`);

  if (judgeResult.error) {
    console.error('judgeContent Error:', judgeResult.error);
  } else {
    console.log('Content Quality Scores (0-10):');
    console.log(`  directAnswer:   ${judgeResult.directAnswer.score}/10`);
    console.log(`    Reason: ${judgeResult.directAnswer.reason}`);
    console.log(`  specificFacts:  ${judgeResult.specificFacts.score}/10`);
    console.log(`    Reason: ${judgeResult.specificFacts.reason}`);
    console.log(`  clarity:        ${judgeResult.clarity.score}/10`);
    console.log(`    Reason: ${judgeResult.clarity.reason}`);
    console.log(`  originality:    ${judgeResult.originality.score}/10`);
    console.log(`    Reason: ${judgeResult.originality.reason}`);
    console.log(`  Matches Input:  ${judgeResult.matchesInputServices ? 'Yes' : 'No'}`);
    console.log(`  Examples Found: ${judgeResult.examplesFound.join(', ')}`);
  }

  // 2. Test buildQuestionCoverage
  console.log('\n--- 2. Running buildQuestionCoverage ---');
  const questionsStart = Date.now();
  const questionsResult = await buildQuestionCoverage(sampleCompany);
  console.log(`Completed in ${((Date.now() - questionsStart) / 1000).toFixed(1)}s\n`);

  if (questionsResult.error) {
    console.error('buildQuestionCoverage Error:', questionsResult.error);
  } else {
    console.log(`Generated ${questionsResult.length} Questions:\n`);
    const answeredCount = questionsResult.filter((q) => q.answered).length;
    questionsResult.forEach((q, idx) => {
      const statusIcon = q.answered ? '✔' : '✖';
      const urlInfo = q.url ? ` (${q.url})` : '';
      console.log(`  ${idx + 1}. [${statusIcon}] ${q.question}${urlInfo}`);
    });
    console.log(`\nCoverage: ${answeredCount}/${questionsResult.length} answered by website content.`);
  }

  console.log('\n' + '='.repeat(65));
  console.log('  Gemini services test complete');
  console.log('='.repeat(65));
}

main().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
