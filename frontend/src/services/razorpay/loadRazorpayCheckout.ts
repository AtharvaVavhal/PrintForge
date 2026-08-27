import type { RazorpayConstructor } from '@/types/razorpay'

const CHECKOUT_SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js'

let loadPromise: Promise<RazorpayConstructor> | null = null

/**
 * Lazily injects Razorpay's Checkout.js script (§13 — no npm package for
 * this, Razorpay attaches `window.Razorpay` itself) and resolves once it's
 * ready. Deduplicated across calls: a second call while the first is still
 * loading reuses the same in-flight promise rather than injecting a second
 * `<script>` tag; once loaded, `window.Razorpay` being set short-circuits
 * every future call for the rest of the page's lifetime. A failed load
 * clears the cached promise so the next call can retry (e.g. a transient
 * network blip), rather than permanently failing every future "Pay" click.
 */
export function loadRazorpayCheckout(): Promise<RazorpayConstructor> {
  if (window.Razorpay) {
    return Promise.resolve(window.Razorpay)
  }
  if (!loadPromise) {
    loadPromise = new Promise<RazorpayConstructor>((resolve, reject) => {
      const script = document.createElement('script')
      script.src = CHECKOUT_SCRIPT_SRC
      script.async = true
      script.onload = () => {
        if (window.Razorpay) {
          resolve(window.Razorpay)
        } else {
          reject(new Error('Razorpay Checkout script loaded but window.Razorpay is unavailable'))
        }
      }
      script.onerror = () => reject(new Error('Failed to load the Razorpay Checkout script'))
      document.head.appendChild(script)
    }).catch((err: unknown) => {
      loadPromise = null
      throw err
    })
  }
  return loadPromise
}
