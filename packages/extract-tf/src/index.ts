export { ExtractTf, extractTf } from './extract.js'
export { classifyBlocks } from './classify.js'
export type { TextBlock, ClassifyOptions } from './classify.js'
export { cleanTree, pruneTree, pruneRecommendations } from './prune.js'
export type { PruneOptions } from './prune.js'
export { selectMain } from './main.js'
export {
  collectProductFacts,
  collectDeclaredProductFacts,
  fillPriceFromText,
  hasAnyProductFact,
  findPriceElement,
  looksLikePrice,
  microdataProductScope,
  selectProduct,
} from './product.js'
export { routePage, pageSignalsFor, selectCardList, selectList, selectTable, selectMinimal } from './route.js'
export type { RouteDecision } from './route.js'
export { htmlToMarkdown, LAYOUT_MARKERS } from './markdown.js'
export type { MarkdownOptions } from './markdown.js'
export { EXTRACTOR_VERSION } from './version.js'
export { collectLinks } from './links.js'
export { collectLabelledValues } from './labels.js'
export { collectPageMetadata } from './metadata.js'
export { amazonAsin, inferAmazonCurrency, isAmazonProductPage, collectAmazonProductFacts, selectAmazonProduct } from './amazon.js'
export { adapterFor, BUILT_IN_ADAPTERS, BUILT_IN_PAGE_ADAPTERS } from './adapters.js'
export type { AdapterMatch, PageAdapterContext, PublicPageAdapter } from './adapters.js'
export type { AdapterValidation } from '@w2l/contracts'
