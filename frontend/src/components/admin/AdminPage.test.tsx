import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AdminPage } from './AdminPage'

function renderPage(ui: Parameters<typeof render>[0]) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

afterEach(cleanup)

describe('AdminPage', () => {
  it('renders the title as the single <h1> plus the content', () => {
    renderPage(
      <AdminPage title="Orders">
        <p>page body</p>
      </AdminPage>,
    )
    const h1 = screen.getByRole('heading', { level: 1, name: 'Orders' })
    expect(h1).toBeInTheDocument()
    expect(screen.getByText('page body')).toBeInTheDocument()
  })

  it('renders an optional description and actions', () => {
    renderPage(
      <AdminPage title="Products" description="Manage the catalogue" actions={<button>New product</button>}>
        <div />
      </AdminPage>,
    )
    expect(screen.getByText('Manage the catalogue')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New product' })).toBeInTheDocument()
  })

  it('omits description / actions / breadcrumb when not provided', () => {
    renderPage(
      <AdminPage title="Settings">
        <div />
      </AdminPage>,
    )
    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).not.toBeInTheDocument()
    // Only the <h1>, no stray text.
    expect(screen.getAllByRole('heading')).toHaveLength(1)
  })

  it('renders breadcrumbs from the shared primitive when supplied', () => {
    renderPage(
      <AdminPage
        title="PF-000001"
        breadcrumbs={[
          { label: 'Admin', to: '/admin' },
          { label: 'Orders', to: '/admin/orders' },
          { label: 'PF-000001' },
        ]}
      >
        <div />
      </AdminPage>,
    )
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(nav).getByRole('link', { name: 'Orders' })).toHaveAttribute('href', '/admin/orders')
  })
})
