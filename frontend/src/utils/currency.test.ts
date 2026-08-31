import { describe, expect, it } from 'vitest'
import { paiseToRupees, rupeesToPaise } from '@/utils/currency'

describe('currency helpers', () => {
  describe('paiseToRupees', () => {
    it('converts paise string to rupees with 2 decimals', () => {
      expect(paiseToRupees('34900')).toBe('349.00')
      expect(paiseToRupees('34950')).toBe('349.50')
      expect(paiseToRupees('100')).toBe('1.00')
      expect(paiseToRupees('0')).toBe('0.00')
    })

    it('converts paise number to rupees with 2 decimals', () => {
      expect(paiseToRupees(34900)).toBe('349.00')
      expect(paiseToRupees(34950)).toBe('349.50')
      expect(paiseToRupees(100)).toBe('1.00')
    })

    it('handles odd paise amounts', () => {
      expect(paiseToRupees('34999')).toBe('349.99')
      expect(paiseToRupees('1')).toBe('0.01')
    })
  })

  describe('rupeesToPaise', () => {
    it('converts rupees string to paise number', () => {
      expect(rupeesToPaise('349.00')).toBe(34900)
      expect(rupeesToPaise('349.50')).toBe(34950)
      expect(rupeesToPaise('1.00')).toBe(100)
      expect(rupeesToPaise('0.00')).toBe(0)
    })

    it('rounds correctly', () => {
      expect(rupeesToPaise('349.99')).toBe(34999)
      expect(rupeesToPaise('0.01')).toBe(1)
    })
  })
})