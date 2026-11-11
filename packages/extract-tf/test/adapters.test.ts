import { describe, expect, it } from 'vitest'
import { BUILT_IN_PAGE_ADAPTERS, extractTf } from '../src/index.js'

describe('public site adapter registry', () => {
  it('registers ordered matcher, extractor and validator contracts with generic last', () => {
    expect(BUILT_IN_PAGE_ADAPTERS.map(adapter => adapter.descriptor.id)).toEqual([
      'amazon-product', 'reddit-public', 'x-public', 'generic',
    ])
    expect(BUILT_IN_PAGE_ADAPTERS.every(adapter => typeof adapter.matches === 'function'
      && typeof adapter.extract === 'function'
      && typeof adapter.validate === 'function')).toBe(true)
  })

  it('emits canonical Amazon product fields without recommendation contamination', () => {
    const html = `<!doctype html><html><head><link rel="canonical" href="https://www.amazon.com/dp/B012345678"></head><body>
      <div id="dp-container"><input name="ASIN" value="B012345678"><h1 id="productTitle">Subject camera</h1>
      <div id="corePrice_feature_div"><span class="a-price"><span class="a-offscreen">$499.00</span></span></div>
      <a id="sellerProfileTriggerId">Camera Shop</a><div id="availability"><span>In Stock</span></div>
      <p id="feature-bullets">The subject camera and its main product description.</p></div>
      <section class="related-products"><a href="/dp/REC0000001">Recommended camera</a><span class="a-price">$29.00</span></section>
    </body></html>`
    const out = extractTf.extract(html, { url: 'https://www.amazon.com/dp/B012345678' })
    expect(out.adapter).toEqual({ id: 'amazon-product', version: '1.0.0', status: 'beta adapter' })
    expect(out.entities).toHaveLength(1)
    expect(out.entities[0]?.type).toBe('product')
    expect(out.entities[0]?.id).toBe('B012345678')
    expect(out.entities[0]?.fields.price?.normalized).toBe('499.00')
    expect(out.adapterValidation?.valid).toBe(true)
    expect(JSON.stringify(out.entities)).not.toContain('29.00')
  })

  // The markup of amazon.com/dp/0135957052 as hosted Octocrawl read it on 2026-10-17 (cd0cbec7), cut down.
  const bookHtml = `<!doctype html><html><head><link rel="canonical" href="https://www.amazon.sg/dp/0135957052"></head><body>
    <div id="dp-container"><input name="ASIN" value="0135957052"><h1 id="productTitle">The Pragmatic Programmer</h1>
    <div id="bylineInfo" class="a-section">by <span class="author notFaded"><a href="/s?field-author=David+Thomas">David Thomas</a>
      <span class="contribution"><span class="a-color-secondary">(Author), </span></span></span>
      <span class="author notFaded"><a href="/Andrew-Hunt/e/B001HMRWA6">Andrew Hunt</a>
      <span class="contribution"><span class="a-color-secondary">(Author)</span></span></span>
      <i class="a-icon a-icon-text-separator"></i><span class="a-color-secondary">Format: </span><span>Hardcover</span></div>
    <div id="corePrice_feature_div"><span class="a-price"><span class="a-offscreen">S$58.83</span></span></div>
    <div id="main-image-container"><img id="landingImage" data-old-hires="https://m.media-amazon.com/images/I/71f1jieYHNL._SL1043_.jpg">
      <img src="https://images-na.ssl-images-amazon.com/images/G/01/x-locale/common/grey-pixel.gif">
      <img src="https://m.media-amazon.com/images/I/spacer.gif" width="1" height="1"></div>
    <div id="detailBullets_feature_div"><ul>
      <li><span class="a-list-item"><span class="a-text-bold">Publisher &rlm; : &lrm; </span> <span>Addison-Wesley Professional</span></span></li>
      <li><span class="a-list-item"><span class="a-text-bold">ISBN-10 &rlm; : &lrm; </span> <span>0135957052</span></span></li>
      <li><span class="a-list-item"><span class="a-text-bold"> Customer Reviews: </span>
        <div id="detailBullets_averageCustomerReviews"><span class="a-icon-alt">4.8 out of 5 stars</span> <span>(3,661)</span>
        <script type="text/javascript">var dpAcrHasRegisteredArcLinkClickAction; P.when('A', 'ready').execute(function(A) {})</script>
        <style>.x{color:red}</style></div></span></li>
    </ul></div></div></body></html>`

  it('reads a book byline as its authors, never as the brand', () => {
    const out = extractTf.extract(bookHtml, { url: 'https://www.amazon.sg/dp/0135957052' })
    const fields = out.entities[0]?.fields
    expect(out.adapterValidation?.valid).toBe(true)
    expect(fields?.brand).toBeUndefined()
    expect(out.product?.brand).toBeNull()
    expect(fields?.authors).toMatchObject({ normalized: ['David Thomas', 'Andrew Hunt'], path: '#bylineInfo .author' })
    expect(JSON.stringify(out.entities)).not.toContain('Format:')
  })

  it('keeps a store byline as the brand without its prefix or a format suffix', () => {
    const html = bookHtml.replace(/<div id="bylineInfo"[\s\S]*?Hardcover<\/span><\/div>/, '<a id="bylineInfo" href="/stores/Anker">Visit the Anker Store</a>')
    const out = extractTf.extract(html, { url: 'https://www.amazon.sg/dp/0135957052' })
    expect(out.entities[0]?.fields.brand?.normalized).toBe('Anker')
    expect(out.entities[0]?.fields.authors).toBeUndefined()
  })

  it('drops placeholder and one-pixel images from an Amazon product', () => {
    const out = extractTf.extract(bookHtml, { url: 'https://www.amazon.sg/dp/0135957052' })
    expect(out.entities[0]?.fields.images?.normalized).toEqual(['https://m.media-amazon.com/images/I/71f1jieYHNL._SL1043_.jpg'])
  })

  it('trims Amazon detail-bullet labels and leaves script and style text out of their values', () => {
    const out = extractTf.extract(bookHtml, { url: 'https://www.amazon.sg/dp/0135957052' })
    expect(out.entities[0]?.fields.specifications?.normalized).toEqual({
      'Publisher': 'Addison-Wesley Professional',
      'ISBN-10': '0135957052',
      'Customer Reviews': '4.8 out of 5 stars (3,661)',
    })
    expect(JSON.stringify(out)).not.toMatch(/dpAcrHasRegisteredArcLinkClickAction|color:red/)
  })

  it('returns an Amazon price only with its currency', () => {
    const out = extractTf.extract(bookHtml.replace('www.amazon.sg', 'www.amazon.com'), { url: 'https://www.amazon.com/dp/0135957052' })
    expect(out.entities[0]?.fields.price?.normalized).toBe('58.83')
    expect(out.entities[0]?.fields.currency?.normalized).toBe('SGD')
    expect(out.entities[0]?.fields.offers?.normalized).toEqual([{ amount: '58.83', currency: 'SGD', priceType: 'current', seller: null }])
  })

  it('keeps an Amazon URL-only product identity unverified', () => {
    const out = extractTf.extract('<html><body><div id="dp-container"><h1 id="productTitle">Uncorroborated product</h1></div></body></html>', {
      url: 'https://www.amazon.com/dp/B012345678',
    })
    expect(out.adapterValidation?.valid).toBe(false)
    expect(out.adapterValidation?.issues).toContain('subject_id_unverified')
  })

  it('accepts a selected Amazon variant when canonical names its parent listing', () => {
    const out = extractTf.extract(`<!doctype html><html><head><link rel="canonical" href="https://www.amazon.sg/Parent/dp/B000000002"></head><body>
      <div id="dp-container"><input name="ASIN" value="B000000001"><h1 id="productTitle">Selected blue variant</h1>
      <div id="corePrice_feature_div"><span class="a-price"><span class="a-offscreen">S$15.70</span></span></div>
      <div id="glow-ingress-line2">Singapore 238823</div></div></body></html>`, {
      url: 'https://www.amazon.sg/dp/B000000001',
    })
    expect(out.adapterValidation).toEqual({ valid: true, issues: [] })
    expect(out.entities[0]?.id).toBe('B000000001')
  })

  it('rejects an Amazon page whose selected ASIN conflicts with its URL', () => {
    const out = extractTf.extract(`<!doctype html><html><head><link rel="canonical" href="https://www.amazon.sg/dp/B000000001"></head><body>
      <div id="dp-container"><input name="ASIN" value="B000000002"><h1 id="productTitle">Different selected product</h1></div></body></html>`, {
      url: 'https://www.amazon.sg/dp/B000000001',
    })
    expect(out.adapterValidation?.valid).toBe(false)
    expect(out.adapterValidation?.issues).toContain('asin_mismatch')
  })

  it('extracts a Reddit post and comment parent graph from public hydration', () => {
    const html = `<!doctype html><html><head><title>Example thread</title>
      <script type="application/json">{"post":{"id":"abc123","title":"Adapter design","selftext":"Public post body","author":"alice","score":42,"num_comments":2},"comments":[{"id":"c1","parent_id":"t3_abc123","body":"First","author":"bob","score":3},{"id":"c2","parent_id":"t1_c1","body":"Reply","author":"carol","score":1}]}</script>
      </head><body><main><h1>Adapter design</h1><p>Public post body with enough text for the generic content selector.</p></main></body></html>`
    const out = extractTf.extract(html, { url: 'https://www.reddit.com/r/webscraping/comments/abc123/adapter_design/' })
    expect(out.adapter.id).toBe('reddit-public')
    const post = out.entities.find(entity => entity.type === 'post')
    const thread = out.entities.find(entity => entity.type === 'thread')
    const comments = out.entities.filter(entity => entity.type === 'comment')
    expect(post?.fields.title?.normalized).toBe('Adapter design')
    expect(post?.relationships.community).toBe('webscraping')
    expect(thread?.relationships.comments).toEqual(['c1', 'c2'])
    expect(comments.find(comment => comment.id === 'c2')?.relationships.parent).toBe('c1')
    expect(comments.every(comment => comment.fields.body?.source === 'hydration')).toBe(true)
  })

  it('lists a Reddit community listing\'s posts, on old.reddit and the current site, each once', () => {
    // The attributes are those both sites carried for r/ClaudeCode's top posts on 2026-11-11, read in a person's Chrome.
    const old = extractTf.extract(`<html><body><div class="content"><h1>ClaudeCode</h1><div id="siteTable">
      <div class=" thing link " data-fullname="t3_1tb7edc" data-author="Apprehensive-Cut3711" data-timestamp="1778604685000" data-url="https://i.redd.it/izgrhw5tgq0h1.png" data-permalink="/r/ClaudeCode/comments/1tb7edc/inherited_a_repo/" data-comments-count="696" data-score="7423" data-promoted="false"><a class="title may-blank" href="https://i.redd.it/izgrhw5tgq0h1.png">Inherited a 3-month old repo from a Vibe Engineer</a></div>
      <div class=" thing link " data-fullname="t3_ad1" data-promoted="true" data-permalink="/r/ClaudeCode/comments/ad1/ad/" data-score="1"><a class="title" href="https://ads.example/">An ad</a></div>
      <div class=" thing link " data-fullname="t3_2abc" data-author="someone" data-timestamp="1778000000000" data-permalink="/r/ClaudeCode/comments/2abc/second/" data-comments-count="12" data-score="300"><a class="title" href="/r/ClaudeCode/comments/2abc/second/">Second post</a></div>
    </div></div></body></html>`, { url: 'https://old.reddit.com/r/ClaudeCode/top/?t=all' })
    expect(old.adapter.id).toBe('reddit-public')
    const oldPosts = old.entities.filter(entity => entity.type === 'post')
    expect(oldPosts.map(post => post.id)).toEqual(['1tb7edc', '2abc'])
    expect(oldPosts[0]).toMatchObject({
      fields: {
        title: { normalized: 'Inherited a 3-month old repo from a Vibe Engineer' }, author: { normalized: 'Apprehensive-Cut3711' },
        score: { normalized: '7423' }, commentCount: { normalized: '696' }, createdAt: { normalized: '2026-05-12T16:51:25.000Z' },
        url: { normalized: 'https://old.reddit.com/r/ClaudeCode/comments/1tb7edc/inherited_a_repo/' }, link: { normalized: 'https://i.redd.it/izgrhw5tgq0h1.png' },
      },
      relationships: { community: 'ClaudeCode' },
    })
    expect(old.entities.find(entity => entity.type === 'community')).toMatchObject({ id: 'ClaudeCode', relationships: { posts: ['1tb7edc', '2abc'] } })
    // A time no date can hold leaves the post without one; it does not stop the page.
    const odd = extractTf.extract('<html><body><h1>ClaudeCode</h1><div class="thing" data-fullname="t3_a" data-timestamp="1e20"><a class="title" href="/x">T</a></div></body></html>', { url: 'https://old.reddit.com/r/ClaudeCode/' })
    expect(odd.entities.find(entity => entity.type === 'post')?.fields).not.toHaveProperty('createdAt')
    const current = extractTf.extract(`<html><body><main><h1>r/ClaudeCode</h1>
      <shreddit-post id="t3_1tb7edc" permalink="/r/ClaudeCode/comments/1tb7edc/inherited_a_repo/" content-href="https://i.redd.it/izgrhw5tgq0h1.png" comment-count="696" created-timestamp="2026-05-12T16:51:25.387000+0000" post-title="Inherited a 3-month old repo from a Vibe Engineer" score="7415" author="Apprehensive-Cut3711"></shreddit-post>
      <shreddit-post id="t3_1tb7edc" permalink="/r/ClaudeCode/comments/1tb7edc/inherited_a_repo/" post-title="Inherited a 3-month old repo from a Vibe Engineer" score="7415"></shreddit-post>
      <shreddit-post id="t3_nameless" permalink="/r/ClaudeCode/comments/nameless/x/"></shreddit-post>
    </main></body></html>`, { url: 'https://www.reddit.com/r/ClaudeCode/top/?t=all' })
    const currentPosts = current.entities.filter(entity => entity.type === 'post')
    expect(currentPosts.map(post => post.id)).toEqual(['1tb7edc'])
    expect(currentPosts[0]).toMatchObject({
      fields: {
        title: { normalized: 'Inherited a 3-month old repo from a Vibe Engineer' }, author: { normalized: 'Apprehensive-Cut3711' }, score: { normalized: '7415' },
        commentCount: { normalized: '696' }, createdAt: { normalized: '2026-05-12T16:51:25.387000+0000' },
        url: { normalized: 'https://www.reddit.com/r/ClaudeCode/comments/1tb7edc/inherited_a_repo/' }, link: { normalized: 'https://i.redd.it/izgrhw5tgq0h1.png' },
      },
    })
  })

  it('extracts Reddit community and profile identities from public URLs', () => {
    const community = extractTf.extract('<html><body><main><h1>Web scraping</h1><p>Public community listing with visible posts and descriptions.</p></main></body></html>', { url: 'https://www.reddit.com/r/webscraping/' })
    const profile = extractTf.extract('<html><body><main><h1>alice</h1><p>Public profile content and recent activity.</p></main></body></html>', { url: 'https://www.reddit.com/user/alice/' })
    expect(community.entities).toContainEqual(expect.objectContaining({ type: 'community', id: 'webscraping' }))
    expect(profile.entities).toContainEqual(expect.objectContaining({ type: 'profile', id: 'alice' }))
    const sorted = extractTf.extract('<html><body><main><h1>Web scraping</h1><p>Top posts of the community.</p></main></body></html>', { url: 'https://old.reddit.com/r/webscraping/top/?t=all' })
    expect(sorted.entities).toContainEqual(expect.objectContaining({ type: 'community', id: 'webscraping' }))
    // A community's other pages (its rules, wiki or submit form) are not its listing: the community's name is no account
    // of them, so the adapter confirms nothing and the answer keeps the page's Markdown (old.reddit.com, 2026-11-11).
    for (const path of ['about/rules', 'wiki/index', 'submit']) {
      const page = extractTf.extract('<html><body><main><h1>Web scraping</h1><h2>Rules for r/webscraping</h2><p>1. Stay on topic.</p></main></body></html>', { url: `https://old.reddit.com/r/webscraping/${path}` })
      expect([path, page.adapter.id, page.entities]).toEqual([path, 'reddit-public', []])
    }
  })

  it('binds an X post to the status URL and ignores other hydration records', () => {
    const html = `<!doctype html><html><head><title>Public post</title>
      <script id="__NEXT_DATA__" type="application/json">{"tweets":[{"rest_id":"111","legacy":{"full_text":"Wrong recommended post"}},{"rest_id":"222","legacy":{"full_text":"The subject public post"}}]}</script>
      </head><body><main><article data-testid="tweet"><a href="/alice/status/222"><time datetime="2026-09-22T10:00:00Z"></time></a><div data-testid="tweetText">The subject public post</div></article></main></body></html>`
    const out = extractTf.extract(html, { url: 'https://x.com/alice/status/222' })
    expect(out.adapter.id).toBe('x-public')
    const post = out.entities.find(entity => entity.type === 'post')
    expect(post?.id).toBe('222')
    expect(post?.fields.text?.normalized).toBe('The subject public post')
    expect(post?.fields.text?.source).toBe('hydration')
    expect(JSON.stringify(post)).not.toContain('Wrong recommended post')
  })

  it('does not substitute another X post when the requested status is absent', () => {
    const html = `<html><head><script type="application/json">{"tweets":[{"rest_id":"111","legacy":{"full_text":"Wrong"}}]}</script></head>
      <body><article data-testid="tweet"><a href="/alice/status/111">Wrong</a><div data-testid="tweetText">Wrong</div></article></body></html>`
    const out = extractTf.extract(html, { url: 'https://x.com/alice/status/222' })
    expect(out.entities).toEqual([])
    expect(out.adapterValidation).toEqual({ valid: false, issues: ['missing_post', 'missing_thread'] })
  })

  it('accepts X post metadata only when both publisher URLs and author match the requested status', () => {
    const html = `<html><head><link rel="canonical" href="https://x.com/alice/status/222">
      <meta property="og:url" content="https://x.com/alice/status/222">
      <meta property="og:title" content="Alice (@alice) on X">
      <meta property="og:description" content="The exact public post"></head>
      <body><main><h1>Post</h1><p>Recommended post: wrong text</p></main></body></html>`
    const out = extractTf.extract(html, { url: 'https://x.com/alice/status/222' })
    expect(out.adapterValidation?.valid).toBe(true)
    expect(out.entities.find(entity => entity.type === 'post')?.fields.text).toMatchObject({ normalized: 'The exact public post', source: 'meta', path: 'meta[property="og:description"]' })
    expect(JSON.stringify(out.entities)).not.toContain('wrong text')
    for (const altered of [
      html.replace('og:url" content="https://x.com/alice/status/222', 'og:url" content="https://x.com/alice/status/111'),
      html.replace('rel="canonical" href="https://x.com/alice/status/222', 'rel="canonical" href="https://x.com/alice/status/111'),
      html.replace('Alice (@alice) on X', 'Bob (@bob) on X'),
    ]) {
      expect(extractTf.extract(altered, { url: 'https://x.com/alice/status/222' }).adapterValidation?.valid).toBe(false)
    }
  })

  it('excludes cross-post and orphan Reddit comments, including transitive descendants', () => {
    const html = `<html><head><script type="application/json">{"post":{"id":"abc123","title":"Target","selftext":"Target body"},
      "comments":[{"id":"c1","parent_id":"t3_abc123","body":"On target"},
      {"id":"c2","parent_id":"t1_c1","body":"Reply on target"},
      {"id":"other","parent_id":"t3_xyz999","body":"Other post"},
      {"id":"otherReply","parent_id":"t1_other","body":"Other reply"},
      {"id":"orphan","parent_id":"t1_missing","body":"Orphan"}]}</script></head>
      <body><main><h1>Target</h1></main></body></html>`
    const out = extractTf.extract(html, { url: 'https://www.reddit.com/r/webscraping/comments/abc123/target/' })
    expect(out.entities.filter(entity => entity.type === 'comment').map(entity => entity.id)).toEqual(['c1', 'c2'])
    expect(out.entities.find(entity => entity.type === 'thread')?.relationships.comments).toEqual(['c1', 'c2'])
    expect(JSON.stringify(out.entities)).not.toMatch(/Other post|Other reply|Orphan/)
  })

  it('does not invent a Reddit post from the URL when the target page is absent', () => {
    const out = extractTf.extract('<html><body><h1>Unavailable</h1><shreddit-post post-id="other"><h1>Other</h1></shreddit-post></body></html>', {
      url: 'https://www.reddit.com/r/webscraping/comments/abc123/target/',
    })
    expect(out.entities).toEqual([])
    expect(out.adapterValidation?.valid).toBe(false)
  })
})
