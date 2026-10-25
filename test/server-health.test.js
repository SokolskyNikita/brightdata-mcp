'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {start_stub_server, close_stub_server}
    from '../test-helpers/stub-server.js';

const test_dir = dirname(fileURLToPath(import.meta.url));
const repo_root = resolve(test_dir, '..');

// tools this fork does not serve; nothing the model reads may name them
const hidden = ['scrape_as_markdown',
    'scrape_as_html', 'scrape_batch', 'extract', 'session_stats',
    'ask_brightdata_assistant', 'list_dataset_fields', 'search_dataset',
    'chatgpt_ai_insights', 'perplexity_ai_insights',
    'scraping_browser_click_ref', 'scraping_browser_type_ref',
    'scraping_browser_fill_form'];
const hidden_re = new RegExp(`\\b(${hidden.join('|')})\\b|Web Unlocker`);

test('nothing the model reads mentions a tool the fork hides', async t=>{
    const stub = await start_stub_server();
    t.after(()=>close_stub_server(stub));
    const env = {...process.env, API_TOKEN: 'server-health-token',
        __BRD_TEST_STUB_URL: `http://127.0.0.1:${stub.address().port}`};
    delete env.GROUPS;
    delete env.TOOLS;
    const client = new Client({name: 'server-health-test', version: '0'},
        {capabilities: {tools: {}}});
    t.after(()=>client.close());
    await client.connect(new StdioClientTransport({cwd: repo_root, env,
        command: process.execPath,
        args: ['--import', './test-helpers/redirect-api.mjs', 'server.js']}));
    assert.doesNotMatch(client.getInstructions(), hidden_re, 'instructions');
    const {tools} = await client.listTools();
    assert.ok(tools.length>0);
    for (const tool of tools)
    {
        assert.ok(!hidden.includes(tool.name), tool.name);
        assert.doesNotMatch(JSON.stringify(tool), hidden_re, tool.name);
    }
    const by_name = Object.fromEntries(tools.map(x=>[x.name, x]));
    assert.deepEqual(Object.keys(by_name.search_engine.inputSchema.properties)
        .sort(), ['cursor', 'query'], 'search_engine is Google only, no geo');
    assert.match(by_name.scraping_browser_snapshot.inputSchema.properties
        .filtered.description, /default: true/);
    const {prompts} = await client.listPrompts();
    assert.ok(prompts.length>0);
    for (const {name, description} of prompts)
    {
        assert.doesNotMatch(description, hidden_re, name);
        const {messages} = await client.getPrompt({name});
        assert.doesNotMatch(JSON.stringify(messages), hidden_re, name);
    }
});
