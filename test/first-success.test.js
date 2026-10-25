'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {first_success} from '../first_success.js';

const sleep = ms=>new Promise(r=>setTimeout(r, ms));
const delays_ms = [0, 60];
// each fake attempt: [ms, value] resolves, [ms, Error] rejects
const run = (plan, opt = {})=>{
    const log = [];
    const t0 = Date.now();
    const p = first_success(async(signal, n)=>{
        log.push({n, at: Date.now()-t0, signal});
        const [ms, out] = plan[n];
        await sleep(ms);
        if (out instanceof Error)
            throw out;
        return out;
    }, {delays_ms, ...opt});
    return {p, log};
};

test('a fast success sends one request', async()=>{
    const {p, log} = run([[10, 'a'], [10, 'b']]);
    assert.equal(await p, 'a');
    await sleep(100);
    assert.equal(log.length, 1);
});

test('a slow first request gets one retry; the faster one wins', async()=>{
    const {p, log} = run([[300, 'slow'], [20, 'fast']]);
    assert.equal(await p, 'fast');
    assert.equal(log.length, 2);
    assert.ok(log[1].at>=55, `retry at ${log[1].at}ms`);
    assert.equal(log[0].signal.aborted, true, 'the loser is aborted');
});

test('the first request can still win after the retry started', async()=>{
    const {p, log} = run([[90, 'first'], [300, 'second']]);
    assert.equal(await p, 'first');
    assert.equal(log[1].signal.aborted, true);
});

test('a failure retries at once instead of waiting', async()=>{
    const {p, log} = run([[5, new Error('empty')], [5, 'ok']]);
    assert.equal(await p, 'ok');
    assert.ok(log[1].at<40, `retry at ${log[1].at}ms`);
});

test('two failures reject with the last error, and nothing more is sent',
async()=>{
    const errors = [];
    const {p, log} = run([[5, new Error('one')], [5, new Error('two')]],
        {on_error: (e, n)=>errors.push([n, e.message])});
    await assert.rejects(p, /two/);
    await sleep(100);
    assert.equal(log.length, 2);
    assert.deepEqual(errors, [[0, 'one'], [1, 'two']]);
});

test('a final error rejects at once with no retry', async()=>{
    const e = Object.assign(new Error('401'), {final: true});
    const {p, log} = run([[5, e], [5, 'never']], {is_final: x=>x.final});
    await assert.rejects(p, /401/);
    await sleep(100);
    assert.equal(log.length, 1);
});
