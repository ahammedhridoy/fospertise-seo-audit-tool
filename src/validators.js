const { z } = require('zod');

const auditInputSchema = z
  .object({
    companyName: z
      .string({ required_error: 'Company name is required' })
      .trim()
      .min(2, 'Company name must be between 2 and 120 characters')
      .max(120, 'Company name must be between 2 and 120 characters'),
    website: z
      .string({ required_error: 'Website is required' })
      .trim()
      .min(1, 'Website is required')
      .transform((val) => {
        if (!/^https?:\/\//i.test(val)) {
          return 'https://' + val;
        }
        return val;
      })
      .pipe(
        z.string().refine(
          (val) => {
            try {
              const u = new URL(val);
              return ['http:', 'https:'].includes(u.protocol) && Boolean(u.hostname);
            } catch {
              return false;
            }
          },
          { message: 'Please enter a valid website address.' }
        )
      ),
    productsServices: z
      .string({ required_error: 'Products and services description is required' })
      .trim()
      .min(3, 'Products and services must be between 3 and 500 characters')
      .max(500, 'Products and services must be between 3 and 500 characters'),
    industry: z
      .string({ required_error: 'Industry is required' })
      .trim()
      .min(2, 'Industry must be between 2 and 100 characters')
      .max(100, 'Industry must be between 2 and 100 characters'),
    location: z
      .string({ required_error: 'Location is required' })
      .trim()
      .min(2, 'Location must be between 2 and 100 characters')
      .max(100, 'Location must be between 2 and 100 characters'),
    email: z
      .string({ required_error: 'Email is required' })
      .trim()
      .toLowerCase()
      .max(254, 'Email cannot exceed 254 characters')
      .email('Please enter a valid email address'),
    consent: z.literal(true, {
      errorMap: () => ({ message: 'Consent must be true' })
    }),
    company_website_2: z.string().trim().optional().default(''),
    turnstileToken: z.string().trim().optional().default('')
  })
  .strict();

module.exports = {
  auditInputSchema
};
