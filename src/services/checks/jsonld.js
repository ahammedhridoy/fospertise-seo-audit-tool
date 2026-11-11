/**
 * Shared JSON-LD helpers for the schema and trust checks.
 * Pure functions over plain data: no network, no scores.
 */

const SCHEMA_ORG_PREFIX = /^(https?:\/\/)?(www\.)?schema\.org\//i;

/**
 * Normalize a schema type: 'https://schema.org/Organization' -> 'Organization'.
 */
function normalizeType(rawType) {
  if (typeof rawType !== 'string') return '';
  let value = rawType.trim();
  if (!value) return '';
  value = value.replace(/^schema:\/\//i, '');
  value = value.replace(SCHEMA_ORG_PREFIX, '');
  return value.trim();
}

/**
 * Return the normalized @type values of a JSON-LD node.
 */
function nodeTypes(node) {
  if (!node || typeof node !== 'object') return [];
  const raw = node['@type'];
  const list = Array.isArray(raw) ? raw : [raw];
  return list.map(normalizeType).filter(Boolean);
}

/**
 * Visit every JSON-LD node that has an @type.
 * Follows arrays, @graph containers and nested properties. Each node is visited once.
 */
function visitNodes(node, visit) {
  if (Array.isArray(node)) {
    for (const item of node) visitNodes(item, visit);
    return;
  }
  if (!node || typeof node !== 'object') return;

  if (node['@type'] !== undefined && node['@type'] !== null) visit(node);

  if (node['@graph']) visitNodes(node['@graph'], visit);

  for (const key of Object.keys(node)) {
    if (key === '@context' || key === '@graph') continue;
    const value = node[key];
    if (value && typeof value === 'object') visitNodes(value, visit);
  }
}

/**
 * Collect every typed JSON-LD node of the given pages.
 *
 * @param {Array<object>} pages - Pages returned by the crawler
 * @returns {{ url: string, types: string[], node: object }[]}
 */
function collectTypedNodes(pages = []) {
  const list = Array.isArray(pages) ? pages : [];
  const found = [];

  for (const page of list) {
    const url = page.url || '';
    const blocks = Array.isArray(page.jsonLd) ? page.jsonLd : [];
    visitNodes(blocks, (node) => {
      found.push({ url, types: nodeTypes(node), node });
    });
  }

  return found;
}

module.exports = {
  normalizeType,
  nodeTypes,
  visitNodes,
  collectTypedNodes
};
