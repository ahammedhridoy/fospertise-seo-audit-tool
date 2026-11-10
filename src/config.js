const dotenv = require('dotenv');
const { z } = require('zod');

dotenv.config();

const cleanString = (val) => (val === '' || val === undefined ? undefined : val);

const envSchema = z.object({
  PORT: z.preprocess(cleanString, z.coerce.number().int().positive().default(3000)),
  NODE_ENV: z.preprocess(cleanString, z.enum(['development', 'production', 'test']).default('development')),
  MONGODB_URI: z.string({ required_error: 'MONGODB_URI is required' }).min(1, 'MONGODB_URI is required'),
  GEMINI_API_KEY: z.string({ required_error: 'GEMINI_API_KEY is required' }).min(1, 'GEMINI_API_KEY is required'),
  GEMINI_MODEL: z.string({ required_error: 'GEMINI_MODEL is required' }).min(1, 'GEMINI_MODEL is required'),
  PAGESPEED_API_KEY: z.string({ required_error: 'PAGESPEED_API_KEY is required' }).min(1, 'PAGESPEED_API_KEY is required'),
  ALLOWED_ORIGINS: z.string({ required_error: 'ALLOWED_ORIGINS is required' })
    .min(1, 'ALLOWED_ORIGINS is required')
    .transform((val) => val.split(',').map((s) => s.trim()).filter(Boolean)),
  MAX_PAGES: z.preprocess(cleanString, z.coerce.number().int().positive().default(15)),
  TURNSTILE_SECRET: z.string().optional().default(''),
  REPORT_BRAND_NAME: z.string().optional().default(''),
  REPORT_BRAND_URL: z.string().optional().default(''),
  REPORT_BRAND_EMAIL: z.string().optional().default('')
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = (parsed.error.issues || parsed.error.errors || []).map((err) => {
    return `- ${err.path.join('.')}: ${err.message}`;
  });
  console.error('Configuration error: Missing or invalid environment variables:');
  console.error(issues.join('\n'));
  process.exit(1);
}

module.exports = Object.freeze(parsed.data);

