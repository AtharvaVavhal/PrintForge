import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Page } from './Page'
import styles from './Page.module.css'

describe('Page', () => {
  it('renders its children inside a <section> carrying the shared shell class', () => {
    render(
      <Page>
        <h1>My account</h1>
        <p>body</p>
      </Page>,
    )

    const heading = screen.getByRole('heading', { level: 1, name: 'My account' })
    const section = heading.closest('section')
    expect(section).not.toBeNull()
    expect(section).toHaveClass(styles.page)
    expect(screen.getByText('body')).toBeInTheDocument()
  })

  it('does not introduce a heading, landmark name, or interactive element of its own', () => {
    const { container } = render(
      <Page>
        <p>just content</p>
      </Page>,
    )

    // No <h1>-<h6> and nothing focusable comes from the primitive itself.
    expect(container.querySelectorAll('h1, h2, h3, h4, h5, h6')).toHaveLength(0)
    expect(container.querySelectorAll('a, button, input, [tabindex]')).toHaveLength(0)
    // A bare <section> with no accessible name is not exposed as a region landmark.
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
  })

  it('merges a page-specific className after the base shell class', () => {
    const { container } = render(<Page className="custom-tweak">x</Page>)
    const section = container.querySelector('section')!
    expect(section).toHaveClass(styles.page)
    expect(section).toHaveClass('custom-tweak')
  })
})
