/**
 * Small HTML fixtures for the check tests: one good site and one empty site.
 * The pages are plain HTML so the real crawler parser can turn them into page objects.
 */

const FILLER = 'We build fast, accessible websites for small businesses and startups, with fixed prices, a two week delivery time and a team you can talk to.';

/**
 * Repeat a sentence until the page has enough words to pass the thin content rule.
 */
function filler(repeats = 13) {
  return Array.from({ length: repeats }, () => FILLER).join(' ');
}

/**
 * Build a page of HTML from its parts.
 */
function page({ title, description = '', canonical, head = '', body = '' }) {
  return `<!doctype html>
<html lang="en">
<head>
  <title>${title}</title>
  ${description ? `<meta name="description" content="${description}">` : ''}
  ${canonical ? `<link rel="canonical" href="${canonical}">` : ''}
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${head}
</head>
<body>
  <header><nav><a href="/about">About</a> <a href="/services">Services</a> <a href="/pricing">Pricing</a> <a href="/contact">Contact</a></nav></header>
  <main>
    ${body}
  </main>
  <footer>
    <p>Call +1 555 010 1234 or write to hello@goodsite.test</p>
    <a href="/privacy">Privacy Policy</a>
    <a href="/terms">Terms of Service</a>
  </footer>
</body>
</html>`;
}

const HOME_JSONLD = JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      name: 'Acme Web Studio',
      url: 'https://goodsite.test/',
      logo: 'https://goodsite.test/logo.png'
    },
    { '@type': 'WebSite', name: 'Acme Web Studio', url: 'https://goodsite.test/' },
    { '@type': 'Service', name: 'Custom website build', serviceType: 'Web development' },
    {
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'How long does a website take?',
          acceptedAnswer: { '@type': 'Answer', text: 'Most websites are live within two weeks.' }
        }
      ]
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home' }]
    }
  ]
});

const CONTACT_JSONLD = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'LocalBusiness',
  name: 'Acme Web Studio',
  url: 'https://goodsite.test/contact',
  telephone: '+1 555 010 1234',
  contactPoint: {
    '@type': 'ContactPoint',
    telephone: '+1 555 010 1234',
    contactType: 'sales',
    email: 'hello@goodsite.test'
  },
  address: {
    '@type': 'PostalAddress',
    streetAddress: '123 Market Street',
    addressLocality: 'Springfield',
    addressRegion: 'IL',
    postalCode: '62704'
  }
});

const TEAM_JSONLD = JSON.stringify([
  { '@context': 'https://schema.org', '@type': 'Person', name: 'Dana Reed', jobTitle: 'Founder' },
  { '@context': 'https://schema.org', '@type': 'Person', name: 'Luis Moreno', jobTitle: 'Lead developer' }
]);

const CASE_JSONLD = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'How Acme rebuilt a local bakery website',
  author: { '@type': 'Person', name: 'Dana Reed' }
});

const GOOD_SITE_HTML = {
  'https://goodsite.test/': page({
    title: 'Acme Web Studio | Custom Websites for Small Businesses',
    description: 'Acme Web Studio builds fast, accessible and search ready websites for small businesses, with fixed prices and delivery in two weeks.',
    canonical: 'https://goodsite.test/',
    head: `<script type="application/ld+json">${HOME_JSONLD}</script>`,
    body: `
    <h1>Websites that bring you customers</h1>
    <h2>What we do</h2>
    <p>${filler()}</p>
    <ul>
      <li>Web design and development</li>
      <li>Search engine optimisation</li>
      <li>Monthly care plans</li>
    </ul>
    <h2>What it costs</h2>
    <table>
      <tr><th>Plan</th><th>Price</th></tr>
      <tr><td>Starter</td><td>1,500 USD</td></tr>
      <tr><td>Growth</td><td>3,200 USD</td></tr>
    </table>
    <h3>Recent work</h3>
    <img src="/bakery.jpg" alt="Bakery website shown on a laptop">
    <img src="/studio.jpg" alt="The Acme team working in the studio">
    <p><a href="/about">Read about us</a> or <a href="/case-studies">see our client results</a>.</p>
    <p>Follow us on <a href="https://www.linkedin.com/company/acme-web-studio">LinkedIn</a> and <a href="https://github.com/acmewebstudio">GitHub</a>.</p>`
  }),

  'https://goodsite.test/about': page({
    title: 'About Acme Web Studio | Our Story and Our Team',
    description: 'Acme Web Studio started in 2016 in Springfield. Meet the small team behind the websites we build and the clients we work with.',
    canonical: 'https://goodsite.test/about',
    head: `<script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: 'About Acme Web Studio'
    })}</script>`,
    body: `
    <h1>About Acme Web Studio</h1>
    <h2>Our story</h2>
    <p>${filler()}</p>
    <h3>What we believe</h3>
    <ul>
      <li>Plain speaking and no lock in contracts</li>
      <li>Fast, accessible pages for every screen</li>
      <li>Written for people and for search engines</li>
    </ul>
    <p>Read more about <a href="/team">our team</a> or <a href="/case-studies">our client case studies</a>.</p>`
  }),

  'https://goodsite.test/services': page({
    title: 'Web Design and Development Services | Acme Web Studio',
    description: 'Website design, development, search engine optimisation and monthly care plans for small businesses, priced clearly and delivered quickly.',
    canonical: 'https://goodsite.test/services',
    head: `<script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: 'Web design and development',
      provider: { '@type': 'Organization', name: 'Acme Web Studio', url: 'https://goodsite.test/' }
    })}</script>`,
    body: `
    <h1>Web design and development services</h1>
    <h2>How the work runs</h2>
    <ol>
      <li>We talk about your business and your customers</li>
      <li>We design and build the website</li>
      <li>We launch and keep it running</li>
    </ol>
    <p>${filler()}</p>
    <h3>What you get</h3>
    <table>
      <tr><th>Service</th><th>Time</th></tr>
      <tr><td>Website build</td><td>Two weeks</td></tr>
      <tr><td>Care plan</td><td>Monthly</td></tr>
    </table>`
  }),

  'https://goodsite.test/products': page({
    title: 'Products and Website Templates | Acme Web Studio',
    description: 'Ready made website templates and add on products for small businesses, each one fast, accessible and easy for your team to update.',
    canonical: 'https://goodsite.test/products',
    head: `<script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: 'Starter website package'
    })}</script>`,
    body: `
    <h1>Products and templates</h1>
    <h2>Starter package</h2>
    <p>${filler()}</p>
    <ul>
      <li>Five pages of copy ready website</li>
      <li>Contact form and phone buttons</li>
      <li>Basic search engine setup</li>
    </ul>`
  }),

  'https://goodsite.test/pricing': page({
    title: 'Simple Fixed Prices for Websites | Acme Web Studio',
    description: 'Clear fixed prices for website builds and monthly care plans. No hourly billing, no hidden extras, and a written quote before we start.',
    canonical: 'https://goodsite.test/pricing',
    body: `
    <h1>Simple fixed prices</h1>
    <h2>What each plan includes</h2>
    <table>
      <tr><th>Plan</th><th>Price</th><th>Delivery</th></tr>
      <tr><td>Starter</td><td>1,500 USD</td><td>One week</td></tr>
      <tr><td>Growth</td><td>3,200 USD</td><td>Two weeks</td></tr>
      <tr><td>Care</td><td>180 USD a month</td><td>Always on</td></tr>
    </table>
    <p>${filler()}</p>`
  }),

  'https://goodsite.test/contact': page({
    title: 'Contact Acme Web Studio | Talk to Our Team Today',
    description: 'Call us on +1 555 010 1234, email hello@goodsite.test or use the contact form. We answer every message within one working day.',
    canonical: 'https://goodsite.test/contact',
    head: `<script type="application/ld+json">${CONTACT_JSONLD}</script>`,
    body: `
    <h1>Contact Acme Web Studio</h1>
    <h2>How to reach us</h2>
    <ul>
      <li>Phone: +1 555 010 1234</li>
      <li>Email: hello@goodsite.test</li>
      <li>Office: 123 Market Street, Springfield</li>
    </ul>
    <p>Call us on +1 555 010 1234 or email hello@goodsite.test. We answer every message within one working day.</p>
    <p>${filler()}</p>
    <p>Our office is at 123 Market Street, Springfield, IL 62704. Parking is free behind the building.</p>
    <h3>Send us a message</h3>
    <form>
      <input type="text" name="name">
      <input type="email" name="email">
      <textarea name="message"></textarea>
      <button type="submit">Send</button>
    </form>`
  }),

  'https://goodsite.test/team': page({
    title: 'Meet the Team Behind Acme Web Studio | About Us',
    description: 'Meet Dana Reed and Luis Moreno, the two people behind Acme Web Studio. Both work directly with every client from first call to launch day.',
    canonical: 'https://goodsite.test/team',
    head: `<script type="application/ld+json">${TEAM_JSONLD}</script>`,
    body: `
    <h1>Meet our team</h1>
    <h2>Dana Reed, founder</h2>
    <p>${filler()}</p>
    <h2>Luis Moreno, lead developer</h2>
    <p>${filler()}</p>
    <h3>How we work together</h3>
    <ul>
      <li>Every client talks to both of us</li>
      <li>Weekly updates while your site is built</li>
      <li>No account managers in between</li>
    </ul>`
  }),

  'https://goodsite.test/case-studies': page({
    title: 'Case Studies and Client Results | Acme Web Studio',
    description: 'Real client case studies with the numbers before and after: more enquiries, faster pages and a website that finally explains the business.',
    canonical: 'https://goodsite.test/case-studies',
    head: `<script type="application/ld+json">${CASE_JSONLD}</script>`,
    body: `
    <h1>Client case studies</h1>
    <h2>A bakery in Springfield</h2>
    <p>${filler()}</p>
    <h3>What the client said</h3>
    <blockquote>Our orders went up by a third after the new website went live.</blockquote>
    <p>Read more of our <a href="/contact">client reviews</a> or see <a href="/services">our services</a>.</p>`
  }),

  'https://goodsite.test/privacy': page({
    title: 'Privacy Policy | Acme Web Studio',
    description: 'How Acme Web Studio collects, uses and stores your personal data, which cookies we use, and how to ask us to delete your information.',
    canonical: 'https://goodsite.test/privacy',
    body: `
    <h1>Privacy policy</h1>
    <h2>What we collect</h2>
    <p>${filler()}</p>
    <h3>Your rights</h3>
    <ul>
      <li>Ask us what we hold about you</li>
      <li>Ask us to correct or delete it</li>
      <li>Complain to your data regulator</li>
    </ul>`
  }),

  'https://goodsite.test/terms': page({
    title: 'Terms of Service | Acme Web Studio',
    description: 'The terms that cover working with Acme Web Studio: what we deliver, how long it takes, what it costs and how either side can end the agreement.',
    canonical: 'https://goodsite.test/terms',
    body: `
    <h1>Terms of service</h1>
    <h2>What we deliver</h2>
    <p>${filler()}</p>
    <h3>Payment and cancellation</h3>
    <ul>
      <li>Half the price is due at the start</li>
      <li>The rest is due when the site goes live</li>
      <li>Care plans run month by month</li>
    </ul>`
  })
};

const EMPTY_SITE_HTML = {
  'https://emptysite.test/': `<!doctype html>
<html lang="en">
<head><title>Home</title></head>
<body><p>Hello.</p></body>
</html>`
};

module.exports = {
  GOOD_SITE_HTML,
  EMPTY_SITE_HTML
};
