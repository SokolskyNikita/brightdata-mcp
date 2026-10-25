'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import url from 'node:url';
import {dirname, resolve} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {unwrap} from '../test-helpers/untrusted.js';
import {start_stub_server, close_stub_server}
    from '../test-helpers/stub-server.js';
import {scraper_tool_names} from '../scraper_tools.js';
import {my_scrapers} from '../my_scrapers.js';
import {tools as browser_tools} from '../browser_tools.js';

const repo_root = resolve(dirname(url.fileURLToPath(import.meta.url)), '..');

const call = async(client, name, args)=>{
    const res = await client.callTool({name, arguments: args});
    const text = res.content.find(b=>b.type=='text').text;
    return {error: res.isError, text,
        data: res.isError ? null : JSON.parse(unwrap(text))};
};

test('scraper tools are on by default and run end to end', async t=>{
    const stub = await start_stub_server();
    t.after(()=>close_stub_server(stub));
    const env = {...process.env, API_TOKEN: 'scraper-test-token',
        __BRD_TEST_STUB_URL: `http://127.0.0.1:${stub.address().port}`};
    delete env.GROUPS;
    delete env.TOOLS;
    const client = new Client({name: 'scraper-tools-test', version: '0'},
        {capabilities: {tools: {}}});
    t.after(()=>client.close());
    await client.connect(new StdioClientTransport({cwd: repo_root, env,
        command: process.execPath,
        args: ['--import', './test-helpers/redirect-api.mjs', 'server.js']}));
    const names = (await client.listTools()).tools.map(x=>x.name);
    for (const name of scraper_tool_names)
        assert.ok(names.includes(name), `${name} listed`);
    // the fixed list is served as is; the stub's online catalog is unused
    assert.deepEqual((await call(client, 'list_scrapers', {})).data,
        my_scrapers);
    const bad = await call(client, 'get_scraper_details',
        {dataset_id: 'gd_nope', method: 'collect_by_url'});
    assert.ok(bad.error);
    assert.match(bad.text, /Unknown dataset_id gd_nope/);
    const run = await call(client, 'run_scraper',
        {dataset_id: 'gd_l1vikfnt1wgvvqz95w', method: 'collect_by_url',
            input: [{url: 'https://www.linkedin.com/company/x/'}]});
    assert.deepEqual(run.data, {snapshot_id: 's_1', status: 'ready',
        data: [{rating: 5}]});
    const trigger = stub.observed_requests.find(r=>r.url);
    assert.equal(trigger.headers.authorization, 'Bearer scraper-test-token');
    assert.equal(trigger.headers['x-mcp-tool'], 'run_scraper');
    const unlisted = await call(client, 'run_scraper', {dataset_id: 'gd_rev',
        method: 'collect_by_url', input: [{url: 'https://amazon.com/r'}]});
    assert.ok(unlisted.error);
    assert.match(unlisted.text, /Unknown dataset_id gd_rev/);
});

const list_tools = async(t, extra_env)=>{
    const stub = await start_stub_server();
    t.after(()=>close_stub_server(stub));
    const env = {...process.env, API_TOKEN: 'scraper-test-token',
        __BRD_TEST_STUB_URL: `http://127.0.0.1:${stub.address().port}`,
        ...extra_env};
    const client = new Client({name: 'scraper-tools-test', version: '0'},
        {capabilities: {tools: {}}});
    t.after(()=>client.close());
    await client.connect(new StdioClientTransport({cwd: repo_root, env,
        command: process.execPath,
        args: ['--import', './test-helpers/redirect-api.mjs', 'server.js']}));
    return (await client.listTools()).tools.map(x=>x.name);
};

test('old groups and web_data names turn on the scraper tools', async t=>{
    for (const env of [{GROUPS: 'ecommerce', TOOLS: ''},
        {GROUPS: '', TOOLS: 'web_data_amazon_product'}])
    {
        const names = await list_tools(t, env);
        assert.ok(names.includes('run_scraper'), JSON.stringify(env));
        assert.ok(!names.some(n=>n.startsWith('web_data_')));
    }
});

const interactive = ['scraping_browser_click_ref',
    'scraping_browser_type_ref', 'scraping_browser_fill_form'];
const served = ['search_engine', 'search_engine_batch', 'get_stats_file',
    ...scraper_tool_names,
    ...browser_tools.map(t=>t.name).filter(n=>!interactive.includes(n))]
    .sort();

test('no GROUPS or TOOLS serves only the scraper and browser tools',
async t=>{
    assert.deepEqual((await list_tools(t, {GROUPS: '', TOOLS: ''})).sort(),
        served);
});

test('GROUPS and TOOLS cannot turn on the other tools', async t=>{
    assert.deepEqual((await list_tools(t, {GROUPS: 'scrapers,browser',
        TOOLS: ''})).sort(), served.filter(n=>n!='search_engine_batch'));
    assert.deepEqual((await list_tools(t, {GROUPS: 'geo,advanced_scraping',
        TOOLS: 'scrape_as_markdown'})).sort(),
        ['get_stats_file', 'search_engine', 'search_engine_batch']);
    // get_stats_file is served whatever GROUPS and TOOLS say
    assert.deepEqual(await list_tools(t, {GROUPS: '',
        TOOLS: 'scrape_as_markdown,web_data_chatgpt_ai_insights'}),
        ['get_stats_file']);
});

test('GROUPS limits the tools to that group', async t=>{
    const names = await list_tools(t, {GROUPS: 'browser', TOOLS: ''});
    assert.ok(names.includes('scraping_browser_navigate'));
    assert.ok(!names.includes('run_scraper'));
});
