import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthContext } from './authContext'
import { createMockAuthContext } from '@/test/test-utils'
import { ProtectedRoute } from './ProtectedRoute'

function renderAt(status: 'loading' | 'authenticated' | 'unauthenticated') {
  return render(
    <AuthContext.Provider value={createMockAuthContext({ status })}>
      <MemoryRouter initialEntries={['/account']}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/account" element={<div>Account content</div>} />
          </Route>
          <Route path="/login" element={<div>Login page</div>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

describe('ProtectedRoute', () => {
  it('shows a full-page loading state (not a blank screen) while auth bootstraps (UX-09)', () => {
    renderAt('loading')

    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Loading')
    expect(screen.queryByText('Account content')).not.toBeInTheDocument()
    expect(screen.queryByText('Login page')).not.toBeInTheDocument()
  })

  it('renders the protected content once authenticated', () => {
    renderAt('authenticated')
    expect(screen.getByText('Account content')).toBeInTheDocument()
  })

  it('redirects to /login when unauthenticated', () => {
    renderAt('unauthenticated')
    expect(screen.getByText('Login page')).toBeInTheDocument()
  })
})
