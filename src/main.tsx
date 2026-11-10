import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import AdminApp from './admin/AdminApp'
import './styles.css'

// /admin is the operator console (SPEC section 6); everything else is the
// user app. The admin UI is useless without Cloudflare Access in front of
// its APIs, which fail closed on the server side.
const isAdmin = window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/')

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isAdmin ? <AdminApp /> : <App />}</StrictMode>,
)
