import '../styles.css'
import './tools.css'
import { trackLinkClicks, trackPageView } from '../analytics'

// /tools/: a static page; only the shared analytics run here (the header's menus are docs-assets/nav.js).
trackPageView()
trackLinkClicks(document.body)
