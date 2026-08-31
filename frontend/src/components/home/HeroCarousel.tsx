import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'
import { cn } from '@/utils/cn'
import { Button } from '@/components/ui/Button'
import type { HeroSlide } from '@/services/api/settings'
import styles from './HeroCarousel.module.css'

interface HeroCarouselProps {
  slides: HeroSlide[]
}

export function HeroCarousel({ slides }: HeroCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(true)

  const slideCount = slides.length

  const goToSlide = useCallback((index: number) => {
    setCurrentIndex((prev) => (index + prev + slideCount) % slideCount)
  }, [slideCount])

  const nextSlide = useCallback(() => goToSlide(1), [goToSlide])
  const prevSlide = useCallback(() => goToSlide(-1), [goToSlide])

  useEffect(() => {
    if (!isPlaying || slideCount <= 1) return
    const timer = setInterval(nextSlide, 5000)
    return () => clearInterval(timer)
  }, [isPlaying, slideCount, nextSlide])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') nextSlide()
    if (e.key === 'ArrowLeft') prevSlide()
    if (e.key === ' ') {
      e.preventDefault()
      setIsPlaying((p) => !p)
    }
  }, [nextSlide, prevSlide])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  if (!slides.length) return null

  return (
    <section className={styles.carousel} aria-label="Hero carousel">
      <div className={styles.track} role="list">
        {slides.map((slide, index) => (
          <div key={index} className={cn(styles.slide, index === currentIndex && styles.active)} role="listitem" aria-hidden={index !== currentIndex}>
            {slide.imageUrl && (
              <img
                src={slide.imageUrl}
                alt={index === currentIndex ? slide.headline : ''}
                className={styles.image}
                loading={index === currentIndex ? 'eager' : 'lazy'}
              />
            )}
            <div className={styles.content}>
              <h1 className={styles.headline}>{slide.headline}</h1>
              <p className={styles.subtext}>{slide.subtext}</p>
              <Link to={slide.ctaLink} className={styles.ctaWrapper}>
                <Button>{slide.ctaText}</Button>
              </Link>
            </div>
          </div>
        ))}
      </div>

      {slideCount > 1 && (
        <>
          <button
            className={cn(styles.navBtn, styles.prev)}
            onClick={prevSlide}
            aria-label="Previous slide"
            disabled={!isPlaying}
          >
            <ChevronLeft size={28} aria-hidden="true" />
          </button>
          <button
            className={cn(styles.navBtn, styles.next)}
            onClick={nextSlide}
            aria-label="Next slide"
            disabled={!isPlaying}
          >
            <ChevronRight size={28} aria-hidden="true" />
          </button>

          <div className={styles.pagination} aria-label="Slide navigation">
            {slides.map((_, index) => (
              <button
                key={index}
                className={cn(styles.dot, index === currentIndex && styles.active)}
                onClick={() => setCurrentIndex(index)}
                aria-label={`Go to slide ${index + 1}`}
                aria-current={index === currentIndex ? 'true' : 'false'}
              />
            ))}
          </div>

          <button
            className={styles.playPause}
            onClick={() => setIsPlaying((p) => !p)}
            aria-label={isPlaying ? 'Pause carousel' : 'Play carousel'}
            aria-pressed={isPlaying}
          >
            {isPlaying ? <Pause size={20} aria-hidden="true" /> : <Play size={20} aria-hidden="true" />}
          </button>
        </>
      )}
    </section>
  )
}
