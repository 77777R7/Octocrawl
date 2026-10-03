export { ExtractTf, extractTf } from './extract.js'
export { classifyBlocks } from './classify.js'
export type { TextBlock, ClassifyOptions } from './classify.js'
export { cleanTree, pruneTree, pruneRecommendations, selectionBody, wholePageBody, withoutLayoutMarkers } from './prune.js'
export { invalidSelector, MAX_SELECTOR_PARTS, namedBy, selectorParts, SUPPORTED_SELECTORS } from './selectors.js'
export type { SelectorRefusal } from './selectors.js'
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
export { htmlToMarkdown, htmlToTables, LAYOUT_MARKERS } from './markdown.js'
export type { ExtractedTable } from './markdown.js'
export type { MarkdownOptions } from './markdown.js'
export { detectRenderSignals, rawSignals, countEmptyTables } from './render.js'
export type { RawRenderSignals } from './render.js'
export { EXTRACTOR_VERSION } from './version.js'
export { collectLinkDetails, collectLinks, LINK_TEXT_MAX_CHARS } from './links.js'
export { collectImages, srcsetUrls } from './images.js'
export { extractListRecords, listExtraction, resolveListSpec, MAX_LIST_RECORDS, MAX_LIST_VALUE_CHARS } from './list.js'
export { detectLists } from './detectList.js'
export type { ListCandidate } from './detectList.js'
export type { ImageCollection } from './images.js'
export { extractAttributes } from './attributes.js'
export { collectLabelledValues } from './labels.js'
export { collectPageMetadata } from './metadata.js'
export { amazonAsin, inferAmazonCurrency, isAmazonProductPage, collectAmazonProductFacts, selectAmazonProduct } from './amazon.js'
export { adapterFor, BUILT_IN_ADAPTERS, BUILT_IN_PAGE_ADAPTERS } from './adapters.js'
export { pdfToMarkdown, pdfPagesForSpan, PDF_TEXT_DEFAULTS, PDF_TEXT_VERSION } from './pdf/index.js'
export { classifyContentType, decodeFileText, detectFile, FILE_EXTENSIONS, FILE_TEXT_VERSION, hasPdfHeader, mediaTypeOf, responseFileName, TEXT_FILE_KINDS } from './file.js'
export type { ContentTypeClass, FileDecision } from './file.js'
export type {
  PdfToMarkdownOptions, PdfToMarkdownResult, PdfText, PdfFailure, PdfErrorCode, PdfPage, PdfInfo, PdfWarning, PdfWarningCode,
} from './pdf/index.js'
export type { AdapterMatch, PageAdapterContext, PublicPageAdapter } from './adapters.js'
export type { AdapterValidation } from '@w2l/contracts'
