/**
 * Typed application configuration, loaded once and exposed via ConfigModule.
 * All values are read from process.env — never hardcoded secrets.
 * See docs/architecture/BLUEPRINT-v1.2.md §31 (Environment Strategy).
 */
export interface AppConfig {
  nodeEnv: string;
  port: number;
  frontendUrl: string;
  backendUrl: string;
  database: {
    url: string;
  };
  auth: {
    accessTokenSecret: string;
    accessTokenExpiresIn: string;
    refreshTokenSecret: string;
    refreshTokenExpiresIn: string;
  };
  razorpay: {
    keyId: string;
    keySecret: string;
    webhookSecret: string;
  };
  resend: {
    apiKey: string;
    emailFromAddress: string;
  };
  cloudinary: {
    cloudName: string;
    apiKey: string;
    apiSecret: string;
  };
}

export default (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '4000', 10),
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  backendUrl: process.env.BACKEND_URL ?? 'http://localhost:4000',
  database: {
    url: process.env.DATABASE_URL ?? '',
  },
  auth: {
    accessTokenSecret: process.env.JWT_ACCESS_SECRET ?? '',
    accessTokenExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshTokenSecret: process.env.REFRESH_TOKEN_SECRET ?? '',
    refreshTokenExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN ?? '30d',
  },
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID ?? '',
    keySecret: process.env.RAZORPAY_KEY_SECRET ?? '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? '',
  },
  resend: {
    apiKey: process.env.RESEND_API_KEY ?? '',
    emailFromAddress: process.env.EMAIL_FROM_ADDRESS ?? '',
  },
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME ?? '',
    apiKey: process.env.CLOUDINARY_API_KEY ?? '',
    apiSecret: process.env.CLOUDINARY_API_SECRET ?? '',
  },
});
