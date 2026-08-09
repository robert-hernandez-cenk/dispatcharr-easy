import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@mantine/core/styles.css'
import { ColorSchemeScript, MantineProvider } from '@mantine/core'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ColorSchemeScript defaultColorScheme="auto" />
    <MantineProvider defaultColorScheme="auto">
      <App />
    </MantineProvider>
  </StrictMode>,
)
