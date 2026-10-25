'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import url from 'node:url';
import {dirname, join, resolve} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {start_stub_server, close_stub_server}
    from '../test-helpers/stub-server.js';
import {create_stats, describe_stats} from '../stats.js';

const repo_root = resolve(dirname(url.fileURLToPath(import.meta.url)), '..');
const tmp_file = t=>{
    const dir = fs.mkdtempSync(join(os.tmpdir(), 'brd-stats-'));
    t.after(()=>fs.rmSync(dir, {recursive: true, force: true}));
    return join(dir, 'nested', 'stats.jsonl');
};

test('create_stats appends one JSON line per record, in order', async t=>{
    const file = tmp_file(t);
    const stats = create_stats(file);
    stats.record({ts: 'a', n: 1});
    stats.record({ts: 'b', n: 2});
    await stats.flush();
    assert.deepEqual(fs.readFileSync(file, 'utf8').trim().split('\n')
        .map(l=>JSON.parse(l).n), [1, 2]);
    assert.deepEqual(await describe_stats(file), {enabled: true, path: file,
        url: url.pathToFileURL(file).href, calls: 2, first: 'a', last: 'b'});
});

test('STATS_FILE=off writes nothing', async()=>{
    const stats = create_stats('off');
    stats.record({ts: 'a'});
    await stats.flush();
    assert.equal(stats.file, null);
    assert.equal((await describe_stats(null)).enabled, false);
});

test('a missing file describes as empty; a write error warns once',
async t=>{
    const file = tmp_file(t);
    assert.equal((await describe_stats(file)).calls, 0);
    const warnings = [];
    fs.mkdirSync(dirname(file), {recursive: true});
    fs.mkdirSync(file); // a directory where the file should be
    const stats = create_stats(file, w=>warnings.push(w));
    stats.record({ts: 'a'});
    stats.record({ts: 'b'});
    await stats.flush();
    assert.equal(warnings.length, 1);
});

test('tool calls land in the stats file and get_stats_file finds it',
async t=>{
    const file = tmp_file(t);
    const stub = await start_stub_server();
    t.after(()=>close_stub_server(stub));
    const env = {...process.env, API_TOKEN: 'stats-test-token',
        STATS_FILE: file,
        __BRD_TEST_STUB_URL: `http://127.0.0.1:${stub.address().port}`};
    delete env.GROUPS;
    delete env.TOOLS;
    const client = new Client({name: 'stats-test', version: '0'},
        {capabilities: {tools: {}}});
    t.after(()=>client.close());
    await client.connect(new StdioClientTransport({cwd: repo_root, env,
        command: process.execPath,
        args: ['--import', './test-helpers/redirect-api.mjs', 'server.js']}));
    // the stub answers searches with plain text, so both attempts fail
    const search = await client.callTool({name: 'search_engine',
        arguments: {query: 'secret query text'}});
    assert.equal(search.isError, true);
    await client.callTool({name: 'get_scraper_details',
        arguments: {dataset_id: 'gd_nope', method: 'collect_by_url'}});
    const res = await client.callTool({name: 'get_stats_file',
        arguments: {}});
    const info = JSON.parse(res.content[0].text);
    assert.equal(info.path, file);
    assert.equal(info.calls, 2);
    const [s, d] = fs.readFileSync(file, 'utf8').trim().split('\n')
        .map(l=>JSON.parse(l));
    assert.equal(s.tool, 'search_engine');
    assert.equal(s.ok, false);
    assert.equal(s.attempts, 2, 'a failed search is retried once');
    assert.equal(typeof s.ms, 'number');
    assert.equal(typeof s.client, 'string');
    assert.match(s.error, /non-JSON/);
    assert.deepEqual([d.tool, d.ok, d.dataset_id, d.method],
        ['get_scraper_details', false, 'gd_nope', 'collect_by_url']);
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'),
        /secret query text|stats-test-token/, 'no arguments or token');
});
