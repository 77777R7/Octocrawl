/** The hosted early-access form. Its values must match packages/public-preview/src/waitlist.ts, which refuses any
 * other (test/waitlist.test.ts checks both lists). It opens the footer and stays hidden until src/waitlist.ts can submit it. */
export const ROLE_OPTIONS = [
  ['academic', 'Academic or policy research'], ['student', 'Graduate student'], ['journalist', 'Data journalism'],
  ['analyst', 'Analyst or think tank'], ['ai_developer', 'Building AI agents or RAG'], ['commerce', 'E-commerce or price monitoring'],
  ['other', 'Something else'],
] as const
export const NEED_OPTIONS = [
  ['hosted', 'Runs while my computer is off'], ['more_previews', 'More previews a day'], ['api_key', 'An API key'],
  ['team', 'Sharing with a team'], ['monitoring', 'Scheduled monitoring'],
] as const

export function waitlistMarkup(): string {
  const roles = ROLE_OPTIONS.map(([value, label]) => `<option value="${value}">${label}</option>`).join('')
  const needs = NEED_OPTIONS.map(([value, label]) => `<label class="waitlist-check"><input type="checkbox" name="needs" value="${value}" /><span>${label}</span></label>`).join('')
  return `<div class="band band-dark waitlist-band" id="waitlist" role="region" aria-labelledby="waitlist-title" hidden>
        <div class="frame waitlist">
          <div class="waitlist-copy">
            <p class="section-kicker"><span class="kicker-square" aria-hidden="true"></span>HOSTED OCTOCRAWL</p>
            <h2 id="waitlist-title">Ask for a hosted Octocrawl key.</h2>
            <p>Hosted Octocrawl is open without a key for a few pages a day. A key gives more pages a day and the browser lane; keys are issued by hand for now. Leave your email and what you would use it for, and we will write back, and may ask once how it went.</p>
          </div>
          <form class="waitlist-form">
            <label class="waitlist-field"><span>Email</span><input type="email" name="email" required maxlength="254" autocomplete="email" /></label>
            <label class="waitlist-field"><span>What do you do? <small>Optional</small></span><select name="role"><option value="">Choose one</option>${roles}</select></label>
            <fieldset class="waitlist-field"><legend>What would you need most? <small>Optional</small></legend><div class="waitlist-checks">${needs}</div></fieldset>
            <label class="waitlist-field"><span>What would you collect with it? <small>Optional</small></span><textarea name="useCase" rows="2" maxlength="200"></textarea></label>
            <label class="waitlist-trap" aria-hidden="true">Leave this empty<input type="text" name="website" tabindex="-1" autocomplete="off" /></label>
            <div class="waitlist-submit"><button type="submit" class="cta-primary">Ask for a key</button><p class="waitlist-status" role="status" aria-live="polite"></p></div>
            <p class="waitlist-note">Your email and answers are kept in Google Cloud in Singapore, only to tell you about hosted Octocrawl. <a href="/docs/privacy/#waitlist">Privacy</a></p>
          </form>
        </div>
      </div>`
}
