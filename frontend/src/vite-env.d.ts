/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
  /** Not read by the checkout/payment flow — see .env.example's comment on
   * this var for why (the per-order razorpayKeyId from the backend is used
   * instead). Kept typed/available for a future caller that needs it. */
  readonly VITE_RAZORPAY_KEY_ID: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
