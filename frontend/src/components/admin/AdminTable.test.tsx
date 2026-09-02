import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Link } from 'react-router-dom'
import { AdminTable } from './AdminTable'

afterEach(cleanup)

function SampleTable() {
  return (
    <MemoryRouter>
      <AdminTable caption="Orders">
        <AdminTable.Head>
          <AdminTable.Row>
            <AdminTable.HeaderCell>Order</AdminTable.HeaderCell>
            <AdminTable.HeaderCell>Status</AdminTable.HeaderCell>
            <AdminTable.HeaderCell align="end">Total</AdminTable.HeaderCell>
          </AdminTable.Row>
        </AdminTable.Head>
        <AdminTable.Body>
          <AdminTable.Row>
            <AdminTable.Cell>
              <Link to="/admin/orders/o1">PF-000001</Link>
            </AdminTable.Cell>
            <AdminTable.Cell>Paid</AdminTable.Cell>
            <AdminTable.Cell align="end">₹199.00</AdminTable.Cell>
          </AdminTable.Row>
        </AdminTable.Body>
      </AdminTable>
    </MemoryRouter>
  )
}

describe('AdminTable', () => {
  it('renders a semantic table with a caption and column headers', () => {
    render(<SampleTable />)
    const table = screen.getByRole('table', { name: 'Orders' })
    const columnHeaders = within(table).getAllByRole('columnheader')
    expect(columnHeaders.map((h) => h.textContent)).toEqual(['Order', 'Status', 'Total'])
    columnHeaders.forEach((h) => expect(h).toHaveAttribute('scope', 'col'))
  })

  it('keeps the caption available to assistive tech even when visually hidden', () => {
    render(<SampleTable />)
    // Default: hidden class, but still in the a11y tree as the table's name.
    expect(screen.getByRole('table', { name: 'Orders' })).toBeInTheDocument()
  })

  it('wraps the table in a horizontally scrollable, focusable region', () => {
    render(<SampleTable />)
    const region = screen.getByRole('region', { name: 'Orders' })
    expect(region).toHaveAttribute('tabindex', '0')
  })

  it('supports a link inside a cell for keyboard-navigable rows', () => {
    render(<SampleTable />)
    expect(screen.getByRole('link', { name: 'PF-000001' })).toHaveAttribute(
      'href',
      '/admin/orders/o1',
    )
  })

  it('renders skeleton rows for the loading state', () => {
    render(
      <AdminTable caption="Loading orders">
        <AdminTable.Head>
          <AdminTable.Row>
            <AdminTable.HeaderCell>Order</AdminTable.HeaderCell>
            <AdminTable.HeaderCell>Total</AdminTable.HeaderCell>
          </AdminTable.Row>
        </AdminTable.Head>
        <AdminTable.SkeletonBody rows={4} columns={2} />
      </AdminTable>,
    )
    // 4 skeleton rows × 2 cells = 8 cells in the body.
    const table = screen.getByRole('table', { name: 'Loading orders' })
    const bodyCells = within(table).getAllByRole('cell', { hidden: true })
    expect(bodyCells).toHaveLength(8)
  })
})
