'use strict'; /*jslint node:true es9:true*/
import {z} from 'zod';

// fork: list_scrapers returns a fixed handpicked list instead of
// searching the online catalog, so there is nothing to refresh
export const scraper_tool_names = ['list_scrapers', 'get_scraper_details',
    'run_scraper', 'get_scraper_progress', 'get_scraper_results'];

const annotations = (name, title)=>{
    const job = name=='run_scraper';
    return {title, readOnlyHint: true, destructiveHint: false,
        openWorldHint: job};
};
const dataset_id = z.string().describe('dataset_id from list_scrapers');
const method = z.string().describe('One of the scraper collection_methods, '
    +'exactly as listed (some names are misspelled on purpose)');
const snapshot_id = z.string().describe('snapshot_id from run_scraper');
const include_fields = z.array(z.string()).optional().describe('Fields '
    +'over 4,000 characters are left out of records unless named here, e.g. '
    +'["updates"]; ["*"] returns every field');

// fork: a few fields can be most of a record (a LinkedIn company's
// "updates" was 27k of 33k chars), so fields over LARGE_FIELD chars are
// left out unless include_fields names them, and the result says which
const LARGE_FIELD = 4000;
export const trim_records = (res, include = [])=>{
    if (!Array.isArray(res?.data) || include.includes('*'))
        return res;
    const omitted = {};
    const data = res.data.map(rec=>{
        if (!rec || typeof rec!='object' || Array.isArray(rec))
            return rec;
        const out = {};
        for (const [k, v] of Object.entries(rec))
        {
            const n = JSON.stringify(v)?.length||0;
            if (n>LARGE_FIELD && !include.includes(k))
                omitted[k] = (omitted[k]||0)+n;
            else
                out[k] = v;
        }
        return out;
    });
    if (!Object.keys(omitted).length)
        return res;
    return {...res, data, omitted_fields: omitted, omitted_note: 'Fields '
        +'over 4,000 characters were left out (total characters shown); '
        +'pass include_fields to get them.'};
};

// fork: names only unless asked; the descriptions were 92% of the reply
// and mostly restate the name ("title": "Product title")
const compact_details = (d, descriptions)=>descriptions || !d?.output_fields
    ? d : {...d, output_fields: d.output_fields.map(f=>f.name).join(', ')};

export function scraper_tools({catalog, runner, tool_fn, headers}){
    const tool = (name, title, description, parameters, fn)=>({name,
        description, annotations: annotations(name, title),
        parameters: z.object(parameters),
        execute: tool_fn(name, async(data, ctx)=>{
            const meta = ctx.tool_meta||{};
            Object.assign(meta, {dataset_id: data.dataset_id,
                method: data.method});
            try {
                return JSON.stringify(await fn(data, headers(ctx, name)));
            } catch(e){
                Object.assign(meta, {failed_step: e.step,
                    error_code: e.error_code});
                throw e;
            }
        }),
    });
    return [
        tool('list_scrapers', 'List Scrapers', 'List every Bright Data '
            +'pre-built scraper available here (LinkedIn, Crunchbase, '
            +'PitchBook, ZoomInfo, Owler, Glassdoor, Indeed). Returns '
            +'dataset_id, name, domain and collection_methods. Next: call '
            +'get_scraper_details with a dataset_id and one method.',
        {}, ()=>catalog.load_catalog()),
        tool('get_scraper_details', 'Get Scraper Details', 'Show the '
            +'scraper description, input fields, example input and main '
            +'output field names for one method. Call before run_scraper and '
            +'build the input from sample_input or input_fields. Records may '
            +'contain more fields than output_fields lists.',
        {dataset_id, method, field_descriptions: z.boolean().optional()
            .describe('List each output field with its description '
                +'(default: false, names only)')},
        async(d, h)=>compact_details(await catalog.get_details(d.dataset_id,
            d.method, h), d.field_descriptions)),
        tool('run_scraper', 'Run Scraper', 'Run a scraper method. input is '
            +'a list of objects shaped like sample_input from '
            +'get_scraper_details, one per URL or query. collect_by_url '
            +'returns one record per input; discover_by_* methods return up '
            +'to limit_per_input records per input, and every record is '
            +'billed. Waits up to 45 seconds; if still running it returns '
            +'snapshot_id with status "running": then poll '
            +'get_scraper_progress and call get_scraper_results when ready. '
            +'Records with an "error" field explain failed inputs. Fields '
            +'over 4,000 characters are left out and listed in '
            +'omitted_fields; ask for them with include_fields.',
        {dataset_id, method, input: z.array(z.record(z.string(), z.any()))
            .min(1).describe('One object per URL or query, shaped like '
                +'sample_input'), limit_per_input: z.number().int().min(1).max(1000)
            .optional().default(10).describe('discover_by_* only'),
            include_fields},
        async(d, h)=>{
            if (!(await catalog.load_catalog()).some(s=>
                s.dataset_id==d.dataset_id))
            {
                throw new Error(`Unknown dataset_id ${d.dataset_id}, `
                    +'use list_scrapers');
            }
            const {include_fields: fields, ...req} = d;
            return trim_records(await runner.run({...req, headers: h}),
                fields);
        }),
        tool('get_scraper_progress', 'Get Scraper Progress', 'Status of a '
            +'run: starting, running, ready, failed or canceled.',
        {snapshot_id}, (d, h)=>runner.progress(d.snapshot_id, h)),
        tool('get_scraper_results', 'Get Scraper Results', 'Records of a '
            +'finished run. Returns status "running" if not ready yet. '
            +'Fields over 4,000 characters are left out and listed in '
            +'omitted_fields; ask for them with include_fields.',
        {snapshot_id, include_fields}, async(d, h)=>trim_records(
            await runner.results(d.snapshot_id, h), d.include_fields)),
    ];
}
