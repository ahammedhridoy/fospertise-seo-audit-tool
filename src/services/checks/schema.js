/**
 * Schema.org JSON-LD check (pure function, plain data only, no scores).
 */

const { nodeTypes, visitNodes } = require('./jsonld');

const ORG_TYPES = new Set(['Organization', 'LocalBusiness', 'ProfessionalService', 'Corporation']);
const OTHER_TYPES = new Set([
  'Service',
  'Product',
  'SoftwareApplication',
  'Article',
  'BlogPosting',
  'WebSite',
  'WebPage',
  'Breadcrumb',
  'BreadcrumbList'
]);
const BREADCRUMB_TYPES = new Set(['Breadcrumb', 'BreadcrumbList']);
const ORG_FIELDS = ['name', 'url', 'logo', 'sameAs', 'contactPoint'];

/**
 * True when a schema field carries a usable value.
 * Empty strings, empty arrays and empty objects count as missing.
 */
function hasValue(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.some(hasValue);
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

/**
 * Analyze the JSON-LD of every crawled page.
 *
 * All JSON-LD is flattened: @graph containers, arrays and nested properties are
 * read, so a type is found wherever it sits in the tree.
 *
 * @param {Array<object>} pages - Pages returned by the crawler
 * @returns {{
 *   types: string[],
 *   perPage: Record<string, string[]>,
 *   hasOrganization: boolean,
 *   hasFAQPage: boolean,
 *   hasServiceOrProductOrArticleOrWebSite: boolean,
 *   hasBreadcrumb: boolean,
 *   parseErrorCount: number,
 *   organizationMissingFields: string[]
 * }}
 */
function checkSchema(pages = []) {
  const list = Array.isArray(pages) ? pages : [];
  const siteTypes = new Set();
  const perPage = {};
  const orgNodes = [];
  let parseErrorCount = 0;

  for (const page of list) {
    const url = page.url || '';
    const pageTypes = new Set();

    if (Number.isFinite(page.jsonLdErrors)) {
      parseErrorCount += page.jsonLdErrors;
    }

    const blocks = Array.isArray(page.jsonLd) ? page.jsonLd : [];
    visitNodes(blocks, (node) => {
      for (const type of nodeTypes(node)) {
        pageTypes.add(type);
        if (ORG_TYPES.has(type)) orgNodes.push(node);
      }
    });

    perPage[url] = Array.from(pageTypes);
    for (const type of pageTypes) siteTypes.add(type);
  }

  const types = Array.from(siteTypes);

  // A field counts as present when at least one Organization family node provides it.
  const presentOrgFields = new Set();
  for (const node of orgNodes) {
    for (const field of ORG_FIELDS) {
      if (hasValue(node[field])) presentOrgFields.add(field);
    }
  }

  return {
    types,
    perPage,
    hasOrganization: types.some((type) => ORG_TYPES.has(type)),
    hasFAQPage: types.includes('FAQPage'),
    hasServiceOrProductOrArticleOrWebSite: types.some((type) => OTHER_TYPES.has(type)),
    hasBreadcrumb: types.some((type) => BREADCRUMB_TYPES.has(type)),
    parseErrorCount,
    organizationMissingFields: ORG_FIELDS.filter((field) => !presentOrgFields.has(field))
  };
}

module.exports = {
  checkSchema
};
