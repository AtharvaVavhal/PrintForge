import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useDebouncedCallback } from './useDebouncedCallback'

/** The hook holds no React state (the debounced fn is a plain ref target),
 * so calling `debounced(...)` / advancing timers triggers no re-render and
 * needs no `act()` wrapper. */
describe('useDebouncedCallback', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('collapses rapid calls into one, fired after the delay with the last args', () => {
    const fn = vi.fn()
    const { result } = renderHook(() => useDebouncedCallback(fn, 400))
    const [debounced] = result.current

    debounced('1')
    debounced('15')
    debounced('150')
    expect(fn).not.toHaveBeenCalled()

    vi.advanceTimersByTime(399)
    expect(fn).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('150')
  })

  it('flush() runs the pending call immediately and only once', () => {
    const fn = vi.fn()
    const { result } = renderHook(() => useDebouncedCallback(fn, 400))
    const [debounced, controls] = result.current

    debounced('now')
    controls.flush()
    expect(fn).toHaveBeenCalledExactlyOnceWith('now')

    // Timer was cleared — advancing time fires nothing further.
    vi.advanceTimersByTime(1000)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('flush() with nothing pending does nothing', () => {
    const fn = vi.fn()
    const { result } = renderHook(() => useDebouncedCallback(fn, 400))
    const [, controls] = result.current

    controls.flush()
    expect(fn).not.toHaveBeenCalled()
  })

  it('cancel() drops the pending call', () => {
    const fn = vi.fn()
    const { result } = renderHook(() => useDebouncedCallback(fn, 400))
    const [debounced, controls] = result.current

    debounced('dropped')
    controls.cancel()
    vi.advanceTimersByTime(1000)
    expect(fn).not.toHaveBeenCalled()
  })

  it('does not fire a pending call after unmount', () => {
    const fn = vi.fn()
    const { result, unmount } = renderHook(() => useDebouncedCallback(fn, 400))
    const [debounced] = result.current

    debounced('late')
    unmount()
    vi.advanceTimersByTime(1000)
    expect(fn).not.toHaveBeenCalled()
  })

  it('always calls the latest callback identity', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { result, rerender } = renderHook(({ cb }) => useDebouncedCallback(cb, 400), {
      initialProps: { cb: first },
    })

    result.current[0]('x')
    rerender({ cb: second })
    vi.advanceTimersByTime(400)

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith('x')
  })
})
