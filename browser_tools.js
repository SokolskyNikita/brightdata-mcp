'use strict'; /*jslint node:true es9:true*/
import {UserError, imageContent as image_content} from 'fastmcp';
import {z} from 'zod';
import axios from 'axios';
import {Browser_session} from './browser_session.js';
let browser_zone = process.env.BROWSER_ZONE || 'mcp_browser';
// fork: filtered snapshots by default; BROWSER_FILTERED_SNAPSHOT=off makes
// full ones the default. Either way the filtered argument overrides it
const browser_filtered_snapshot = process.env.BROWSER_FILTERED_SNAPSHOT!='off';

let open_session;
let open_session_country = null;
const require_browser = async country=>{
    const normalized_country = country ? country.toLowerCase()
        : open_session_country;

    const needs_new_session = !open_session
        || normalized_country!==open_session_country;

    if (needs_new_session)
    {
        open_session_country = normalized_country || null;
        open_session = new Browser_session({
            cdp_endpoint: await calculate_cdp_endpoint(open_session_country),
        });
    }
    return open_session;
};

const calculate_cdp_endpoint = async country=>{
    try {
        const status_response = await axios({
            url: 'https://api.brightdata.com/status',
            method: 'GET',
            headers: {authorization: `Bearer ${process.env.API_TOKEN}`},
        });
        const customer = status_response.data.customer;
        const password_response = await axios({
            url: `https://api.brightdata.com/zone/passwords?zone=${browser_zone}`,
            method: 'GET',
            headers: {authorization: `Bearer ${process.env.API_TOKEN}`},
        });
        const password = password_response.data.passwords[0];

        const country_suffix = country ? `-country-${country}` : '';
        return `wss://brd-customer-${customer}-zone-${browser_zone}`
            +`${country_suffix}:${password}@brd.superproxy.io:9222`;
    } catch(e){
        if (e.response?.status===422)
            throw new Error(`Browser zone '${browser_zone}' does not exist`);
        throw new Error(`Error retrieving browser credentials: ${e.message}`);
    }
};

let scraping_browser_navigate = {
    name: 'scraping_browser_navigate',
    description: [
        'Open a URL in a real Chrome browser run by Bright Data. Slower than '
        +'scrape_as_markdown (about 5s per page): use it when scraping '
        +'returns empty or blocked content, or the page needs JavaScript, '
        +'scrolling, clicking or typing.',
        'Returns only the final URL and title; read the page with '
        +'scraping_browser_get_text, scraping_browser_snapshot or '
        +'scraping_browser_screenshot.',
        'If it fails (some pages are unavailable to the browser), the '
        +'previous page stays open: do not read that as the new page.',
    ].join('\n'),
    annotations: {
        title: 'Browser Navigate',
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
    },
    parameters: z.object({
        url: z.string().describe('Full URL to open, with https://'),
        country: z.string().regex(/^[A-Za-z]{2}$/)
            .optional()
            .describe('2-letter country code (e.g. "US", "GB") to open the '
            +'page from that country. Changing it starts a new browser '
            +'session.'),
    }),
    execute: async({url, country})=>{
        const normalized_country = country?.toLowerCase();
        const browser_session = await require_browser(normalized_country);
        const page = await browser_session.get_page({url});
        await browser_session.clear_requests();
        try {
            await page.goto(url, {
                timeout: 120000,
                waitUntil: 'domcontentloaded',
            });
            return [
                `Successfully navigated to ${url}`,
                `Title: ${await page.title()}`,
                `URL: ${page.url()}`,
            ].join('\n');
        } catch(e){
            throw new UserError(`Error navigating to ${url}: ${e}`);
        }
    },
};

let scraping_browser_go_back = {
    name: 'scraping_browser_go_back',
    description: 'Go back to the previous page in the browser '
        +'history, like the Back button. Returns the URL and title.',
    annotations: {
        title: 'Browser Go Back',
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
    },
    parameters: z.object({}),
    execute: async()=>{
        const page = await (await require_browser()).get_page();
        try {
            await page.goBack();
            return [
                'Successfully navigated back',
                `Title: ${await page.title()}`,
                `URL: ${page.url()}`,
            ].join('\n');
        } catch(e){
            throw new UserError(`Error navigating back: ${e}`);
        }
    },
};

const scraping_browser_go_forward = {
    name: 'scraping_browser_go_forward',
    description: 'Go forward to the next page in the browser '
        +'history, like the Forward button. Returns the URL and title.',
    annotations: {
        title: 'Browser Go Forward',
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
    },
    parameters: z.object({}),
    execute: async()=>{
        const page = await (await require_browser()).get_page();
        try {
            await page.goForward();
            return [
                'Successfully navigated forward',
                `Title: ${await page.title()}`,
                `URL: ${page.url()}`,
            ].join('\n');
        } catch(e){
            throw new UserError(`Error navigating forward: ${e}`);
        }
    },
};

let scraping_browser_snapshot = {
    name: 'scraping_browser_snapshot',
    description: [
        'List the elements of the current page with ref IDs (e.g. [e23]) to '
        +'pass to scraping_browser_click_ref, scraping_browser_type_ref, '
        +'scraping_browser_fill_form, scraping_browser_scroll_to_ref and '
        +'scraping_browser_wait_for_ref.',
        'Take a new snapshot after the page changes: refs from an old one may '
        +'point at other elements.',
        'To read the page text use scraping_browser_get_text; to see the '
        +'layout use scraping_browser_screenshot.',
    ].join('\n'),
    annotations: {
        title: 'Browser Snapshot',
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
    },
    parameters: z.object({
        filtered: z.boolean().optional().describe(
            'List only links, buttons and form fields, without page text '
            +`(default: ${browser_filtered_snapshot}). false returns the `
            +'full page tree with its text, several times larger: use it '
            +'when an element you need is missing from the filtered list. '
            +'Keep true for sensitive actions (payments, account changes) so '
            +'page text cannot pose as an element.'),
    }),
    execute: async({filtered=browser_filtered_snapshot})=>{
        const browser_session = await require_browser();
        const page = await browser_session.get_page();
        try {
            const snapshot = await browser_session.capture_snapshot(
                {filtered});
            const lines = [
                `Page: ${snapshot.url}`,
                `Title: ${snapshot.title}`,
                '',
                'Interactive Elements:',
                snapshot.aria_snapshot,
            ];
            if (snapshot.dom_snapshot)
            {
                lines.push('');
                lines.push('DOM Interactive Elements:');
                lines.push(snapshot.dom_snapshot);
            }
            return lines.join('\n');
        } catch(e){
            throw new UserError(`Error capturing snapshot: ${e}`);
        }
    },
};

let scraping_browser_click_ref = {
    name: 'scraping_browser_click_ref',
    description: [
        'Click an element (link, button, tab, checkbox) by its ref from the '
        +'latest scraping_browser_snapshot.',
        'Returns a confirmation only: take a new snapshot or call '
        +'scraping_browser_get_text to see what changed.',
    ].join('\n'),
    annotations: {
        title: 'Browser Click Element',
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
    },
    parameters: z.object({
        ref: z.string().describe('Ref from the latest snapshot, e.g. "e23"'),
        element: z.string().describe('Short description of the element, '
            +'e.g. "Next page button"'),
    }),
    execute: async({ref, element})=>{
        const browser_session = await require_browser();
        try {
            const locator = await browser_session.ref_locator({element, ref});
            await locator.click({timeout: 5000});
            return `Successfully clicked element: ${element} (ref=${ref})`;
        } catch(e){
            throw new UserError(`Error clicking element ${element} with ref ${ref}: ${e}`);
        }
    },
};

let scraping_browser_type_ref = {
    name: 'scraping_browser_type_ref',
    description: [
        'Type text into a text field by its ref from the latest '
        +'scraping_browser_snapshot, replacing what it holds. Set submit to '
        +'press Enter afterwards, e.g. to run a search.',
        'Returns a confirmation only: read the page again to see the result.',
    ].join('\n'),
    annotations: {
        title: 'Browser Type Text',
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
    },
    parameters: z.object({
        ref: z.string().describe('Ref from the latest snapshot, e.g. "e23"'),
        element: z.string().describe('Short description of the field, '
            +'e.g. "Search box"'),
        text: z.string().describe('Text to type'),
        submit: z.boolean().optional()
            .describe('Press Enter after typing (default: false)'),
    }),
    execute: async({ref, element, text, submit})=>{
        const browser_session = await require_browser();
        try {
            const locator = await browser_session.ref_locator({element, ref});
            await locator.fill(text);
            // fork: press Enter on the page, not the locator; sites like
            // Wikipedia swap the input for a new element while typing, and
            // the old ref then never resolves (30s timeout)
            if (submit)
            {
                const page = await browser_session.get_page();
                await page.keyboard.press('Enter');
            }
            const suffix = submit ? ' and submitted the form' : '';
            return 'Successfully typed "'+text+'" into element: '+element
                +' (ref='+ref+')'+suffix;
        } catch(e){
            throw new UserError(`Error typing into element ${element} with ref ${ref}: ${e}`);
        }
    },
};

let scraping_browser_screenshot = {
    name: 'scraping_browser_screenshot',
    description: [
        'Take a PNG screenshot of the current page and return it as an image: '
        +'for layout, charts, images or anything that is not text. Needs a '
        +'model that can read images.',
        'Captures the visible window unless full_page is set.',
    ].join('\n'),
    annotations: {
        title: 'Browser Screenshot',
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
    },
    parameters: z.object({
        full_page: z.boolean().optional().describe('Capture the whole '
            +'scrollable page, not just the window (default: false). '
            +'Full-page images can be very large.'),
    }),
    execute: async({full_page=false})=>{
        const page = await (await require_browser()).get_page();
        try {
            const buffer = await page.screenshot({fullPage: full_page});
            return image_content({buffer});
        } catch(e){
            throw new UserError(`Error taking screenshot: ${e}`);
        }
    },
};

let scraping_browser_get_html = {
    name: 'scraping_browser_get_html',
    description: [
        'Return the HTML of the current page: the <body> only, or the whole '
        +'document with <head> and scripts when full_page is true.',
        'Usually much larger than scraping_browser_get_text: use it only when '
        +'you need markup such as attributes, link targets or tables. For a '
        +'page that does not need a browser, scrape_as_html is faster.',
    ].join('\n'),
    annotations: {
        title: 'Browser Get HTML',
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
    },
    parameters: z.object({
        full_page: z.boolean().optional().describe('Include <head> and '
            +'script tags (default: false). This can be very large.'),
    }),
    execute: async({full_page=false})=>{
        const page = await (await require_browser()).get_page();
        try {
            if (!full_page)
                return await page.$eval('body', body=>body.innerHTML);
            const html = await page.content();
            if (!full_page && html)
                return html.split('<body>')[1].split('</body>')[0];
            return html;
        } catch(e){
            throw new UserError(`Error getting HTML content: ${e}`);
        }
    },
};

let scraping_browser_get_text = {
    name: 'scraping_browser_get_text',
    description: [
        'Return the visible text of the current page (its innerText): no '
        +'links, images or markup.',
        'Reads the page already open and loads nothing: call '
        +'scraping_browser_navigate first. If that failed, this returns the '
        +'previous page.',
        'For a page that does not need a browser, scrape_as_markdown is '
        +'faster and keeps links.',
    ].join('\n'),
    annotations: {
        title: 'Browser Get Text',
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
    },
    parameters: z.object({}),
    execute: async()=>{
        const page = await (await require_browser()).get_page();
        try { return await page.$eval('body', body=>body.innerText); }
        catch(e){ throw new UserError(`Error getting text content: ${e}`); }
    },
};

let scraping_browser_scroll = {
    name: 'scraping_browser_scroll',
    description: [
        'Scroll to the bottom of the current page so content that loads as '
        +'you scroll (feeds, lazy images, "load more" lists) appears.',
        'Call it again for more, then read the page again.',
    ].join('\n'),
    annotations: {
        title: 'Browser Scroll',
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
    },
    parameters: z.object({}),
    execute: async()=>{
        const page = await (await require_browser()).get_page();
        try {
            await page.evaluate(()=>{
                window.scrollTo(0, document.body.scrollHeight);
            });
            return 'Successfully scrolled to the bottom of the page';
        } catch(e){
            throw new UserError(`Error scrolling page: ${e}`);
        }
    },
};

let scraping_browser_scroll_to_ref = {
    name: 'scraping_browser_scroll_to_ref',
    description: 'Scroll an element into view by its ref from '
        +'the latest scraping_browser_snapshot, e.g. to load the content '
        +'around it or before a screenshot.',
    annotations: {
        title: 'Browser Scroll to Element',
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
    },
    parameters: z.object({
        ref: z.string().describe('Ref from the latest snapshot, e.g. "e23"'),
        element: z.string().describe('Short description of the element'),
    }),
    execute: async({ref, element})=>{
        const browser_session = await require_browser();
        try {
            const locator = await browser_session.ref_locator({element, ref});
            await locator.scrollIntoViewIfNeeded();
            return `Successfully scrolled to element: ${element} (ref=${ref})`;
        } catch(e){
            throw new UserError(`Error scrolling to element ${element} with `
                +`ref ${ref}: ${e}`);
        }
    },
};

let scraping_browser_network_requests = {
    name: 'scraping_browser_network_requests',
    description: [
        'List the network requests the current page made since it was '
        +'opened: method, URL and status of each.',
        'Useful to find the API a page loads its data from, or why content '
        +'is missing.',
    ].join('\n'),
    annotations: {
        title: 'Browser Network Requests',
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
    },
    parameters: z.object({}),
    execute: async()=>{
        const browser_session = await require_browser();
        try {
            const requests = await browser_session.get_requests();
            if (requests.size==0) 
                return 'No network requests recorded for the current page.';

            const results = [];
            requests.forEach((response, request)=>{
                const result = [];
                result.push(`[${request.method().toUpperCase()}] ${request.url()}`);
                if (response)
                    result.push(`=> [${response.status()}] ${response.statusText()}`);

                results.push(result.join(' '));
            });
            
            return [
                `Network Requests (${results.length} total):`,
                '',
                ...results
            ].join('\n');
        } catch(e){
            throw new UserError(`Error getting network requests: ${e}`);
        }
    },
};

let scraping_browser_wait_for_ref = {
    name: 'scraping_browser_wait_for_ref',
    description: [
        'Wait until an element, by its ref from the latest '
        +'scraping_browser_snapshot, is visible, e.g. results that appear '
        +'after a click. Fails after timeout.',
    ].join('\n'),
    annotations: {
        title: 'Browser Wait for Element',
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
    },
    parameters: z.object({
        ref: z.string().describe('Ref from the latest snapshot, e.g. "e23"'),
        element: z.string().describe('Short description of the element'),
        timeout: z.number().optional()
            .describe('Maximum time to wait in milliseconds (default: 30000)'),
    }),
    execute: async({ref, element, timeout})=>{
        const browser_session = await require_browser();
        try {
            const locator = await browser_session.ref_locator({element, ref});
            await locator.waitFor({timeout: timeout || 30000});
            return `Successfully waited for element: ${element} (ref=${ref})`;
        } catch(e){
            throw new UserError(`Error waiting for element ${element} with ref ${ref}: ${e}`);
        }
    },
};

let scraping_browser_fill_form = {
    name: 'scraping_browser_fill_form',
    description: [
        'Fill several form fields in one call (text boxes, checkboxes, radio '
        +'buttons, dropdowns, sliders), each by its ref from the latest '
        +'scraping_browser_snapshot.',
        'Does not submit the form: click its submit button with '
        +'scraping_browser_click_ref.',
    ].join('\n'),
    annotations: {
        title: 'Browser Fill Form',
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
    },
    parameters: z.object({
        fields: z.array(z.object({
            name: z.string().describe('Human-readable field name'),
            type: z.enum(['textbox', 'checkbox', 'radio', 'combobox',
                'slider']).describe('Type of the field'),
            ref: z.string().describe(
                'Ref from the latest snapshot, e.g. "e23"'),
            value: z.string().describe([
                'Value to fill in the field.',
                'For checkbox: use "true" or "false".',
                'For combobox: use the text of the option to select.'
            ].join(' ')),
        })).describe('Fields to fill in'),
    }),
    execute: async({fields})=>{
        const browser_session = await require_browser();
        try {
            const results = [];
            for (const field of fields)
            {
                const locator = await browser_session.ref_locator({
                    element: field.name,
                    ref: field.ref,
                });
                if (field.type=='textbox' || field.type=='slider')
                {
                    await locator.fill(field.value);
                    results.push(`Filled ${field.name} with "${field.value}"`);
                }
                else if (field.type=='checkbox' || field.type=='radio')
                {
                    const checked = field.value=='true';
                    await locator.setChecked(checked);
                    results.push(`Set ${field.name} to ${checked ? 'checked'
                        : 'unchecked'}`);
                }
                else if (field.type=='combobox')
                {
                    await locator.selectOption({label: field.value});
                    results.push(`Selected "${field.value}" in ${field.name}`);
                }
            }
            return 'Successfully filled form:\n'+results.join('\n');
        } catch(e){
            throw new UserError(`Error filling form: ${e}`);
        }
    },
};

// fork: Bright Data refuses pages that robots.txt disallows unless the
// account passed KYC, with a long error about KYC applications (the
// browser) or a "Residential Failed (bad_endpoint)" body (the unlocker).
// The model only needs to know the page cannot be opened here, and that a
// browser on the user's machine (no robots.txt rule) can open it
const blocked_re = new RegExp('restricted in accordance with robots\\.txt'
    +'|kyc-verification|access mode in accordance with robots\\.txt'
    +'|brightdata\\.com/cp/kyc', 'i');
export const blocked_page_text = 'BrightData MCP was unable to open this '
    +'page; please try your local browser instead';
export const is_blocked_page = e=>blocked_re.test(String(e?.message ?? e));

export const tools = [
    scraping_browser_navigate,
    scraping_browser_go_back,
    scraping_browser_go_forward,
    scraping_browser_snapshot,
    scraping_browser_click_ref,
    scraping_browser_type_ref,
    scraping_browser_screenshot,
    scraping_browser_network_requests,
    scraping_browser_wait_for_ref,
    scraping_browser_fill_form,
    scraping_browser_get_text,
    scraping_browser_get_html,
    scraping_browser_scroll,
    scraping_browser_scroll_to_ref,
];
