import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AboutPage } from './AboutPage'
import { ContactPage } from './ContactPage'
import { PrivacyPage } from './PrivacyPage'
import { TermsPage } from './TermsPage'
import { RefundPolicyPage } from './RefundPolicyPage'

function renderPage(Component: React.ComponentType) {
  return render(
    <MemoryRouter>
      <Component />
    </MemoryRouter>
  )
}

describe('Static pages render without error', () => {
  it('AboutPage', () => {
    renderPage(AboutPage)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'About PrintForge'
    )
  })

  it('ContactPage', () => {
    renderPage(ContactPage)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Contact Us'
    )
  })

  it('PrivacyPage', () => {
    renderPage(PrivacyPage)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Privacy Policy'
    )
  })

  it('TermsPage', () => {
    renderPage(TermsPage)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Terms of Service'
    )
  })

  it('RefundPolicyPage', () => {
    renderPage(RefundPolicyPage)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Refund Policy'
    )
  })
})
