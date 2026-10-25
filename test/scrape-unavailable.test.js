'use strict'; /*jslint node:true es9:true*/
// fork: the unlocker's robots.txt / KYC refusal and empty bodies arrive as
// HTTP 200; the scrape tools report them as failures, not page content.
import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {start_stub_server, close_stub_server}
    from '../test-helpers/stub-server.js';

const repo_root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BLOCKED = 'https://kyc-blocked.example/issues?q=x';
const EMPTY = 'https://empty.example/';
const GOOD = 'https://good.example/page';

test('refused and empty pages are failures, with a short reason',
async t=>{
    const stub = await start_stub_server();
    t.after(()=>close_stub_server(stub));
    const env = {...process.env, API_TOKEN: 'scrape-unavailable-token',
        __BRD_TEST_STUB_URL: `http://127.0.0.1:${stub.address().port}`};
    delete env.GROUPS;
    delete env.TOOLS;
    const client = new Client({name: 'scrape-unavailable', version: '0'},
        {capabilities: {tools: {}}});
    t.after(()=>client.close());
    await client.connect(new StdioClientTransport({cwd: repo_root, env,
        command: process.execPath,
        args: ['--import', './test-helpers/redirect-api.mjs', 'server.js']}));
    for (const name of ['scrape_as_markdown', 'scrape_as_html'])
    {
        const r = await client.callTool({name, arguments: {url: BLOCKED}});
        assert.equal(r.isError, true, name);
        assert.match(r.content[0].text, new RegExp('BrightData MCP was '
            +'unable to open this page; please try your local browser '
            +'instead$'), name);
        assert.doesNotMatch(r.content[0].text, /KYC|robots/i, name);
    }
    const empty = await client.callTool({name: 'scrape_as_markdown',
        arguments: {url: EMPTY}});
    assert.equal(empty.isError, true);
    assert.match(empty.content[0].text, /The page came back empty\./);
    const batch = await client.callTool({name: 'scrape_batch',
        arguments: {urls: [BLOCKED, EMPTY, GOOD]}});
    assert.deepEqual(JSON.parse(batch.content[0].text).map(x=>[x.status,
        x.url ?? x.value?.url, x.reason]), [
        ['rejected', BLOCKED, 'BrightData MCP was unable to open this page; '
            +'please try your local browser instead'],
        ['rejected', EMPTY, 'The page came back empty.'],
        ['fulfilled', GOOD, undefined]]);
});
