import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import MockAdapter from 'axios-mock-adapter'
import { apiClient } from '@/services/api/client'
import { Seo } from '@/seo/Seo'
import { StoreContextProvider } from './StoreContextProvider'
import { useSiteOrigin } from './useSiteOrigin'
import { useStoreContext } from './useStoreContext'

/**
 * Phase 9 W7 (spec §10.4, §14.6) — the store-context seam: it renders children
 * after the bootstrap, renders them with a safe fallback when the bootstrap
 * fails, and is what makes the SEO layer host-aware.
 */
const SERVED_ORIGIN = window.location.origin
const PRIMARY_ORIGIN = 'https://primary-store.example'

function Probe() {
  const { context, isLoading, isError } = useStoreContext()
  const origin = useSiteOrigin()
  return (
    <div>
      <span data-testid="origin">{origin}</span>
      <span data-testid="store-name">{context?.storeName ?? '(none)'}</span>
      <span data-testid="state">
        {isLoading ? 'loading' : isError ? 'error' : 'ready'}
      </span>
    </div>
  )
}

function renderWithProvider(ui: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <StoreContextProvider>{ui}</StoreContextProvider>
    </QueryClientProvider>,
  )
}

describe('StoreContextProvider', () => {
  let mock: MockAdapter

  beforeEach(() => {
    mock = new MockAdapter(apiClient)
  })

  afterEach(() => {
    mock.restore()
  })

  it('exposes the store context once GET /storefront/context resolves', async () => {
    mock.onGet('/storefront/context').reply(200, {
      success: true,
      data: {
        storeId: 's1',
        storeName: 'Acme Prints',
        storeStatus: 'ACTIVE',
        canonicalOrigin: PRIMARY_ORIGIN,
        isPrimary: true,
        resolvedBy: 'origin',
      },
    })

    renderWithProvider(<Probe />)

    await waitFor(() =>
      expect(screen.getByTestId('store-name')).toHaveTextContent('Acme Prints'),
    )
    expect(screen.getByTestId('state')).toHaveTextContent('ready')
    expect(screen.getByTestId('origin')).toHaveTextContent(PRIMARY_ORIGIN)
  })

  it('renders children immediately, before the bootstrap resolves, on the served host', async () => {
    mock.onGet('/storefront/context').reply(() => new Promise(() => {}))
    renderWithProvider(<Probe />)
    // Children are on screen with a usable origin while the fetch is pending —
    // the bootstrap never gates paint.
    expect(screen.getByTestId('origin')).toHaveTextContent(SERVED_ORIGIN)
    await waitFor(() =>
      expect(screen.getByTestId('state')).toHaveTextContent('loading'),
    )
  })

  it('falls back safely when the bootstrap fails — children still render', async () => {
    mock.onGet('/storefront/context').reply(500)
    renderWithProvider(<Probe />)

    await waitFor(() =>
      expect(screen.getByTestId('state')).toHaveTextContent('error'),
    )
    expect(screen.getByTestId('store-name')).toHaveTextContent('(none)')
    expect(screen.getByTestId('origin')).toHaveTextContent(SERVED_ORIGIN)
  })

  it('falls back to the served host on an unserved host (404), rather than failing the page', async () => {
    mock.onGet('/storefront/context').reply(404, {
      success: false,
      message: 'Store not found',
    })
    renderWithProvider(<Probe />)

    await waitFor(() =>
      expect(screen.getByTestId('state')).toHaveTextContent('error'),
    )
    expect(screen.getByTestId('origin')).toHaveTextContent(SERVED_ORIGIN)
  })

  it('uses the served host when the backend reports canonicalOrigin: null (legacy mode)', async () => {
    mock.onGet('/storefront/context').reply(200, {
      success: true,
      data: {
        storeId: 's1',
        storeName: 'Legacy Store',
        storeStatus: 'ACTIVE',
        canonicalOrigin: null,
        isPrimary: true,
        resolvedBy: 'legacy',
      },
    })
    renderWithProvider(<Probe />)

    await waitFor(() =>
      expect(screen.getByTestId('store-name')).toHaveTextContent('Legacy Store'),
    )
    expect(screen.getByTestId('origin')).toHaveTextContent(SERVED_ORIGIN)
  })

  it('a component rendered with NO provider degrades to the served host, never throwing', () => {
    render(<Probe />)
    expect(screen.getByTestId('origin')).toHaveTextContent(SERVED_ORIGIN)
    expect(screen.getByTestId('state')).toHaveTextContent('ready')
  })

  // ─── the reason the seam exists (§10.2, §11) ────────────────────────────

  it('canonical points at the PRIMARY host when served on a non-primary host', async () => {
    mock.onGet('/storefront/context').reply(200, {
      success: true,
      data: {
        storeId: 's1',
        storeName: 'Acme',
        storeStatus: 'ACTIVE',
        canonicalOrigin: PRIMARY_ORIGIN,
        isPrimary: false,
        resolvedBy: 'origin',
      },
    })

    renderWithProvider(<Seo title="About" canonicalPath="/about" />)

    await waitFor(() =>
      expect(
        document.head.querySelector('link[rel="canonical"]')?.getAttribute('href'),
      ).toBe(`${PRIMARY_ORIGIN}/about`),
    )
    // …and never the host this browser happens to be on.
    expect(
      document.head.querySelector('link[rel="canonical"]')?.getAttribute('href'),
    ).not.toContain(SERVED_ORIGIN)
  })

  it('two different stores get two different canonical origins from the same bundle', async () => {
    for (const origin of ['https://store-a.example', 'https://store-b.example']) {
      mock.resetHandlers()
      mock.onGet('/storefront/context').reply(200, {
        success: true,
        data: {
          storeId: 's',
          storeName: 'S',
          storeStatus: 'ACTIVE',
          canonicalOrigin: origin,
          isPrimary: true,
          resolvedBy: 'origin',
        },
      })
      const { unmount } = renderWithProvider(
        <Seo title="Home" canonicalPath="/" />,
      )
      await waitFor(() =>
        expect(
          document.head
            .querySelector('link[rel="canonical"]')
            ?.getAttribute('href'),
        ).toBe(`${origin}/`),
      )
      unmount()
    }
  })
})
