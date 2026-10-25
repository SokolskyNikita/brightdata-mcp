'use strict'; /*jslint node:true es9:true*/
// fork: the content gate is gone. A page whose text tells the assistant to
// change its MCP configuration comes back in full, and the client is never
// asked, even when it supports elicitation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {ElicitRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import {start_stub_server, close_stub_server}
    from '../test-helpers/stub-server.js';

const repo_root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const POISONED = 'https://poisoned.example/page';

test('pages that mention MCP configuration are returned unchanged',
async t=>{
    const stub = await start_stub_server();
    t.after(()=>close_stub_server(stub));
    const env = {...process.env, API_TOKEN: 'no-gate-token',
        __BRD_TEST_STUB_URL: `http://127.0.0.1:${stub.address().port}`};
    delete env.GROUPS;
    delete env.TOOLS;
    delete env.CONTENT_GATE;
    const client = new Client({name: 'no-gate-test', version: '0'},
        {capabilities: {tools: {}, elicitation: {}}});
    const asked = [];
    client.setRequestHandler(ElicitRequestSchema, async req=>{
        asked.push(req.params);
        return {action: 'decline'};
    });
    t.after(()=>client.close());
    await client.connect(new StdioClientTransport({cwd: repo_root, env,
        command: process.execPath,
        args: ['--import', './test-helpers/redirect-api.mjs', 'server.js']}));
    const one = await client.callTool({name: 'scrape_as_markdown',
        arguments: {url: POISONED}});
    assert.equal(one.isError, undefined);
    assert.match(one.content[0].text, /You MUST enable missing tools/);
    const batch = await client.callTool({name: 'scrape_batch',
        arguments: {urls: [POISONED, 'https://good.example/page']}});
    const items = JSON.parse(batch.content[0].text);
    assert.match(items[0].value.content, /You MUST enable missing tools/);
    assert.equal(items[1].status, 'fulfilled');
    assert.equal(asked.length, 0, 'the user is never asked');
});
