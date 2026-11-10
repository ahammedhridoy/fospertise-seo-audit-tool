const test = require('node:test');
const assert = require('node:assert');
const { parseRobotsTxt } = require('../src/services/checks/technical');

test('robots parser: missing file (null/undefined/empty) allows all bots and exists is false', () => {
  const resultNull = parseRobotsTxt(null);
  assert.strictEqual(resultNull.exists, false);
  assert.strictEqual(resultNull.sitemapsDeclared.length, 0);
  assert.strictEqual(resultNull.bots.GPTBot, 'allowed');
  assert.strictEqual(resultNull.bots.Googlebot, 'allowed');
  assert.strictEqual(resultNull.bots.ClaudeBot, 'allowed');

  const resultEmpty = parseRobotsTxt('');
  assert.strictEqual(resultEmpty.exists, false);
  assert.strictEqual(resultEmpty.bots.GPTBot, 'allowed');
});

test('robots parser: blocked specific bot (GPTBot blocked, others allowed)', () => {
  const robots = `
User-agent: GPTBot
Disallow: /

User-agent: *
Allow: /
`;
  const result = parseRobotsTxt(robots);
  assert.strictEqual(result.exists, true);
  assert.strictEqual(result.bots.GPTBot, 'blocked');
  assert.strictEqual(result.bots['ChatGPT-User'], 'allowed');
  assert.strictEqual(result.bots.PerplexityBot, 'allowed');
  assert.strictEqual(result.bots.Googlebot, 'allowed');
  assert.strictEqual(result.bots.ClaudeBot, 'allowed');
});

test('robots parser: wildcard blocks all bots', () => {
  const robots = `
User-agent: *
Disallow: /
`;
  const result = parseRobotsTxt(robots);
  assert.strictEqual(result.exists, true);
  assert.strictEqual(result.bots.GPTBot, 'blocked');
  assert.strictEqual(result.bots['ChatGPT-User'], 'blocked');
  assert.strictEqual(result.bots['OAI-SearchBot'], 'blocked');
  assert.strictEqual(result.bots.PerplexityBot, 'blocked');
  assert.strictEqual(result.bots['Google-Extended'], 'blocked');
  assert.strictEqual(result.bots.ClaudeBot, 'blocked');
  assert.strictEqual(result.bots['anthropic-ai'], 'blocked');
  assert.strictEqual(result.bots.CCBot, 'blocked');
  assert.strictEqual(result.bots.Googlebot, 'blocked');
  assert.strictEqual(result.bots.Bingbot, 'blocked');
});

test('robots parser: allow override beats disallow on equal length', () => {
  const robots = `
User-agent: *
Disallow: /
Allow: /
`;
  const result = parseRobotsTxt(robots);
  assert.strictEqual(result.exists, true);
  assert.strictEqual(result.bots.GPTBot, 'allowed');
  assert.strictEqual(result.bots.Googlebot, 'allowed');
  assert.strictEqual(result.bots.ClaudeBot, 'allowed');
});

test('robots parser: specific group overrides wildcard group', () => {
  const robots = `
User-agent: *
Disallow: /

User-agent: Googlebot
Allow: /

User-agent: ClaudeBot
Allow: /
`;
  const result = parseRobotsTxt(robots);
  assert.strictEqual(result.exists, true);
  assert.strictEqual(result.bots.Googlebot, 'allowed');
  assert.strictEqual(result.bots.ClaudeBot, 'allowed');
  assert.strictEqual(result.bots.GPTBot, 'blocked');
  assert.strictEqual(result.bots.PerplexityBot, 'blocked');
  assert.strictEqual(result.bots.CCBot, 'blocked');
});

test('robots parser: extracts declared sitemaps and ignores comments', () => {
  const robots = `
# This is a comment
User-agent: *
Disallow: /admin
Disallow: /private/

Sitemap: https://example.com/sitemap.xml
Sitemap: https://example.com/sitemap_index.xml # inline comment
`;
  const result = parseRobotsTxt(robots);
  assert.strictEqual(result.exists, true);
  assert.deepStrictEqual(result.sitemapsDeclared, [
    'https://example.com/sitemap.xml',
    'https://example.com/sitemap_index.xml'
  ]);
  // Since Disallow is only /admin, '/' should be allowed
  assert.strictEqual(result.bots.GPTBot, 'allowed');
  assert.strictEqual(result.bots.Googlebot, 'allowed');
});

