// LICENSE_CODE ZON
'use strict'; /*jslint node:true es9:true*/

const web_scraping_strategy = {
    name: 'web_scraping_strategy',
    description: 'Decision tree for picking the right Bright Data tool. '
        +'Invoke at the start of any scraping session to learn the correct '
        +'tool selection order (pre-built scrapers -> Browser API).',
    arguments: [],
    load: ()=>`\
You have access to Bright Data tools at two tiers of cost and capability.
Always follow this order -- do not skip ahead:

STEP 1 -- Check for a pre-built scraper (fastest, structured JSON):
  Call list_scrapers and pick the one for the site or data type (e.g.
  "LinkedIn company information"). If one fits, call get_scraper_details, then
  run_scraper with input shaped like sample_input. If you do not know the
  URL yet, find it with search_engine first. If run_scraper returns
  a snapshot_id that is still running, poll get_scraper_progress, then
  call get_scraper_results.

STEP 2 -- If no scraper matches, use the browser:
  Call scraping_browser_navigate on the URL, then
  scraping_browser_get_text or scraping_browser_snapshot to read it.
  Use scraping_browser_click_ref, scraping_browser_type_ref and
  scraping_browser_fill_form for pages that need interaction.

NEVER use the browser tools when a pre-built scraper covers the site.`,
};

const diagnose_scraping_approach = {
    name: 'diagnose_scraping_approach',
    description: 'Run a two-step diagnostic to discover the correct '
        +'Bright Data product for a new website. Tries a pre-built scraper '
        +'first, then Browser API, then reports which succeeded.',
    arguments: [],
    load: ()=>`\
To discover the correct Bright Data product for a new website, run this
diagnostic:

1. Call list_scrapers and look for the site's domain.
   - If a scraper matches and run_scraper returns useful data -> the Web
     Scraper API is the correct integration. Stop.
   - If none matches or the results are empty -> continue to step 2.

2. Try scraping_browser_navigate + scraping_browser_snapshot on the
   target URL.
   - If it returns useful content -> Browser API is the correct
     integration. Stop.
   - If both fail -> report to the user that the target may require
     custom configuration.

Report which approach succeeded and recommend it as the integration method.
Do not proceed with data extraction until the diagnostic is complete.`,
};

const prompts = [web_scraping_strategy, diagnose_scraping_approach];

export default prompts;
