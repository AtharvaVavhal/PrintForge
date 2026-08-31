import { Outlet } from 'react-router-dom'
import { Header } from './Header'
import { Footer } from './Footer'
import { AnnouncementBar } from '@/components/layout/AnnouncementBar'
import styles from './RootLayout.module.css'

export function RootLayout() {
  return (
    <div className={styles.shell}>
      <AnnouncementBar />
      <Header />
      <main className={styles.main}>
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
