/**
 * Trust and Credibility checks (pure function, plain data only).
 */

const SOCIAL_DOMAINS = [
  { platform: 'linkedin', regex: /linkedin\.com\/(?:company|in)\//i },
  { platform: 'facebook', regex: /facebook\.com\//i },
  { platform: 'x', regex: /(?:twitter\.com|x\.com)\//i },
  { platform: 'github', regex: /github\.com\//i },
  { platform: 'youtube', regex: /youtube\.com\/(?:@|channel|user|c)\//i },
  { platform: 'instagram', regex: /instagram\.com\//i }
];

const ADDRESS_REGEX = /\b\d{1,5}\s+[\w\s.,#-]+(?:Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Drive|Dr|Lane|Ln|Way|Court|Ct|Plaza|Plz|Square|Sq|Suite|Ste|Floor|Fl)\b|\b(?:Post\s*Office\s*Box|P\.?O\.?\s*Box)\s+\d+\b/i;

function truncateSnippet(text, maxLen = 100) {
  if (!text) return null;
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen - 3) + '...';
}

/**
 * Check trust signals across all crawled pages.
 *
 * @param {Array<object>} pages - Array of page objects from crawler
 * @returns {{
 *   aboutPage: { found: boolean, evidence: string|null },
 *   contactPage: { found: boolean, evidence: string|null },
 *   phone: { found: boolean, evidence: string|null },
 *   email: { found: boolean, evidence: string|null },
 *   physicalAddress: { found: boolean, evidence: string|null },
 *   teamOrAuthor: { found: boolean, evidence: string|null },
 *   socialLinks: { found: boolean, platforms: string[], evidence: string[] },
 *   privacyPage: { found: boolean, evidence: string|null },
 *   termsPage: { found: boolean, evidence: string|null },
 *   testimonialsOrCaseStudies: { found: boolean, isFullSectionOrPage: boolean, evidence: string|null }
 * }}
 */
function checkTrust(pages = []) {
  let aboutPage = { found: false, evidence: null };
  let contactPage = { found: false, evidence: null };
  let phone = { found: false, evidence: null };
  let email = { found: false, evidence: null };
  let physicalAddress = { found: false, evidence: null };
  let teamOrAuthor = { found: false, evidence: null };
  let privacyPage = { found: false, evidence: null };
  let termsPage = { found: false, evidence: null };
  let testimonialsOrCaseStudies = { found: false, isFullSectionOrPage: false, evidence: null };

  const foundSocialPlatforms = new Map(); // platform -> url

  for (const page of pages) {
    const rawUrl = page.url || '';
    let pathname = '';
    try {
      pathname = new URL(rawUrl).pathname.toLowerCase();
    } catch (_) {
      pathname = rawUrl.toLowerCase();
    }
    const title = (page.title || '').toLowerCase();
    const mainText = page.mainText || '';

    // 1. About page
    if (!aboutPage.found) {
      if (/\b(about|who-we-are|our-story|our-company)\b/i.test(pathname) || /about\s+us/i.test(title)) {
        aboutPage = { found: true, evidence: rawUrl };
      }
    }

    // 2. Contact page
    if (!contactPage.found) {
      if (/\b(contact|get-in-touch|reach-us)\b/i.test(pathname) || /contact\s+us/i.test(title)) {
        contactPage = { found: true, evidence: rawUrl };
      }
    }

    // 3. Phone
    if (!phone.found && Array.isArray(page.phones) && page.phones.length > 0) {
      phone = { found: true, evidence: page.phones[0] };
    }

    // 4. Email
    if (!email.found && Array.isArray(page.emails) && page.emails.length > 0) {
      email = { found: true, evidence: page.emails[0] };
    }

    // 5. Physical Address
    if (!physicalAddress.found) {
      // Check JSON-LD for PostalAddress
      if (Array.isArray(page.jsonLd)) {
        const jsonLdStr = JSON.stringify(page.jsonLd);
        if (/PostalAddress/i.test(jsonLdStr)) {
          physicalAddress = { found: true, evidence: 'Found PostalAddress in JSON-LD on ' + rawUrl };
        }
      }
      // Check text for address patterns
      if (!physicalAddress.found) {
        const match = mainText.match(ADDRESS_REGEX);
        if (match) {
          physicalAddress = { found: true, evidence: truncateSnippet(match[0]) };
        }
      }
    }

    // 6. Team or Author
    if (!teamOrAuthor.found) {
      if (/\b(team|people|staff|leadership|our-team)\b/i.test(pathname) || /our\s+team|leadership/i.test(title)) {
        teamOrAuthor = { found: true, evidence: 'Team page: ' + rawUrl };
      } else if (/\b(our\s+team|meet\s+the\s+team|leadership\s+team|author:|written\s+by)\b/i.test(mainText)) {
        const match = mainText.match(/\b(?:our\s+team|meet\s+the\s+team|leadership\s+team|written\s+by\s+[\w\s]+)/i);
        teamOrAuthor = { found: true, evidence: truncateSnippet(match ? match[0] : 'Team mention in content') };
      } else if (Array.isArray(page.jsonLd) && /"@type"\s*:\s*"(?:Person|author)"/i.test(JSON.stringify(page.jsonLd))) {
        teamOrAuthor = { found: true, evidence: 'Found Person/author in JSON-LD on ' + rawUrl };
      }
    }

    // 7. Social profiles
    const extLinks = Array.isArray(page.externalLinks) ? page.externalLinks : [];
    for (const link of extLinks) {
      for (const social of SOCIAL_DOMAINS) {
        if (!foundSocialPlatforms.has(social.platform) && social.regex.test(link)) {
          foundSocialPlatforms.set(social.platform, link);
        }
      }
    }

    // 8. Privacy policy page
    if (!privacyPage.found) {
      if (/\b(privacy|privacy-policy)\b/i.test(pathname) || /privacy\s+policy/i.test(title)) {
        privacyPage = { found: true, evidence: rawUrl };
      }
    }

    // 9. Terms of service page
    if (!termsPage.found) {
      if (/\b(terms|terms-of-service|terms-and-conditions|tos)\b/i.test(pathname) || /terms\s+(?:of\s+service|and\s+conditions)/i.test(title)) {
        termsPage = { found: true, evidence: rawUrl };
      }
    }

    // 10. Testimonials / Reviews / Case studies
    if (!testimonialsOrCaseStudies.found || !testimonialsOrCaseStudies.isFullSectionOrPage) {
      if (/\b(testimonial|testimonials|reviews|case-study|case-studies|portfolio|clients|customer-stories)\b/i.test(pathname) ||
          /testimonials|case\s+studies|reviews/i.test(title)) {
        testimonialsOrCaseStudies = {
          found: true,
          isFullSectionOrPage: true,
          evidence: 'Dedicated page/section: ' + rawUrl
        };
      } else if (!testimonialsOrCaseStudies.found && /\b(testimonials?|client\s+reviews?|case\s+stud(?:y|ies)|what\s+our\s+clients\s+say)\b/i.test(mainText)) {
        const match = mainText.match(/\b(?:testimonials?|client\s+reviews?|case\s+stud(?:y|ies)|what\s+our\s+clients\s+say)\b/i);
        testimonialsOrCaseStudies = {
          found: true,
          isFullSectionOrPage: false,
          evidence: truncateSnippet(match ? match[0] : 'Testimonials mention in content')
        };
      }
    }
  }

  const platforms = Array.from(foundSocialPlatforms.keys());
  const socialEvidence = Array.from(foundSocialPlatforms.values());

  return {
    aboutPage,
    contactPage,
    phone,
    email,
    physicalAddress,
    teamOrAuthor,
    socialLinks: {
      found: platforms.length > 0,
      platforms,
      evidence: socialEvidence
    },
    privacyPage,
    termsPage,
    testimonialsOrCaseStudies
  };
}

module.exports = {
  checkTrust
};
