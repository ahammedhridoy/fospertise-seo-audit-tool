/**
 * HTML structure and on-page checks (pure function, plain data only, no scores).
 */

const TITLE_MIN = 30;
const TITLE_MAX = 65;
const META_MIN = 70;
const META_MAX = 160;
const THIN_WORD_LIMIT = 250;

// Homepage plus pages whose path suggests about, services, products, contact or pricing.
const KEY_PAGE_PATH = /(?:^|[/_-])(about|who-we-are|our-story|services?|solutions?|products?|offerings?|contact|pricing|prices|plans?)(?:$|[/_-])/i;

/**
 * Return the lowercase path of a URL, or an empty string when it cannot be parsed.
 */
function pagePath(url) {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * True when a page is a key page: the homepage, or a page whose path suggests
 * about, services, products, contact or pricing.
 */
function isKeyPage(page, index = -1) {
  if (index === 0) return true;
  const path = pagePath(page && page.url);
  if (path === '/' || path === '') return true;
  return KEY_PAGE_PATH.test(path);
}

/**
 * Ratio rounded to two decimals.
 */
function ratio(part, total) {
  if (!total) return 0;
  return Number((part / total).toFixed(2));
}

/**
 * Analyze the structure of every crawled page.
 *
 * @param {Array<object>} pages - Pages returned by the crawler
 * @returns {{
 *   h1Ok: number,
 *   headingOrderOkRatio: number,
 *   titleOkRatio: number,
 *   metaDescOkRatio: number,
 *   canonicalRatio: number,
 *   listOrTableRatio: number,
 *   imageAltRatio: number,
 *   avgWords: number,
 *   thinPages: string[]
 * }}
 */
function checkStructure(pages = []) {
  const list = Array.isArray(pages) ? pages : [];

  if (list.length === 0) {
    return {
      h1Ok: 0,
      headingOrderOkRatio: 0,
      titleOkRatio: 0,
      metaDescOkRatio: 0,
      canonicalRatio: 0,
      listOrTableRatio: 0,
      imageAltRatio: 1, // No images at all counts as a full score.
      avgWords: 0,
      thinPages: []
    };
  }

  const keyPages = list.filter((page, index) => isKeyPage(page, index));
  const effectiveKeyPages = keyPages.length > 0 ? keyPages : [list[0]];

  let keyPagesWithOneH1 = 0;
  let keyPagesWithListOrTable = 0;
  for (const page of effectiveKeyPages) {
    if (Array.isArray(page.h1) && page.h1.length === 1) keyPagesWithOneH1++;
    if ((page.listCount || 0) > 0 || (page.tableCount || 0) > 0) keyPagesWithListOrTable++;
  }

  let headingOrderOkCount = 0;
  let titleOkCount = 0;
  let metaDescOkCount = 0;
  let canonicalCount = 0;
  let totalWords = 0;
  let totalImages = 0;
  let totalImagesWithAlt = 0;
  const thinPages = [];

  for (const page of list) {
    if (page.headingOrderOk === true) headingOrderOkCount++;

    const titleLength = String(page.title || '').trim().length;
    if (titleLength >= TITLE_MIN && titleLength <= TITLE_MAX) titleOkCount++;

    const metaLength = String(page.metaDescription || '').trim().length;
    if (metaLength >= META_MIN && metaLength <= META_MAX) metaDescOkCount++;

    if (String(page.canonical || '').trim().length > 0) canonicalCount++;

    const words = Number.isFinite(page.wordCount) ? page.wordCount : 0;
    totalWords += words;
    if (words < THIN_WORD_LIMIT) thinPages.push(page.url);

    const imageCount = Number.isFinite(page.imageCount) ? page.imageCount : 0;
    const imagesWithAlt = Number.isFinite(page.imagesWithAlt) ? page.imagesWithAlt : 0;
    totalImages += imageCount;
    totalImagesWithAlt += imagesWithAlt;
  }

  const imageAltRatio = totalImages === 0
    ? 1
    : ratio(totalImagesWithAlt, totalImages);

  return {
    h1Ok: ratio(keyPagesWithOneH1, effectiveKeyPages.length),
    headingOrderOkRatio: ratio(headingOrderOkCount, list.length),
    titleOkRatio: ratio(titleOkCount, list.length),
    metaDescOkRatio: ratio(metaDescOkCount, list.length),
    canonicalRatio: ratio(canonicalCount, list.length),
    listOrTableRatio: ratio(keyPagesWithListOrTable, effectiveKeyPages.length),
    imageAltRatio,
    avgWords: Math.round(totalWords / list.length),
    thinPages
  };
}

module.exports = {
  checkStructure,
  isKeyPage
};
