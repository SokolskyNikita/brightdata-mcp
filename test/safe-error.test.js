'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {safe_error, redact_url_creds, html_to_text} from '../safe_error.js';

test('safe_error redacts the token and URL credentials', ()=>{
    const e = new Error('tok-123 failed at wss://cust:pass-1@host:9222');
    assert.equal(safe_error(e, 'tok-123'),
        '[REDACTED] failed at wss://[REDACTED]@host:9222');
});

test('safe_error drops the stack and hides non-error values', ()=>{
    const e = new Error('boom');
    assert.equal(safe_error(e), 'boom');
    assert.equal(safe_error({secret: 1}), 'Tool execution failed');
    assert.equal(safe_error(undefined), 'Tool execution failed');
});

test('safe_error caps at 2000 characters and warns', ()=>{
    const warnings = [];
    const text = safe_error('x'.repeat(2500), null, w=>warnings.push(w));
    assert.equal(text.length, 2000);
    assert.deepEqual(warnings, ['[error] truncated 2500 chars']);
});

test('html_to_text keeps only the text of an error page', ()=>{
    const page = '<!DOCTYPE html><html><head><title>502 Bad Gateway</title>'
        +'<style>body{color:red}</style><script>var x = "<p>";</script>'
        +'</head><body><!-- edge 7 --><h1>Bad&nbsp;Gateway</h1>'
        +'<p>Retry &amp; wait</p></body></html>';
    assert.equal(html_to_text(page), '502 Bad Gateway Bad Gateway Retry & wait');
});

test('html_to_text leaves plain text and JSON alone', ()=>{
    assert.equal(html_to_text('a < b > c'), 'a < b > c');
    assert.equal(html_to_text('{"error":"<bad>"}'), '{"error":"<bad>"}');
    assert.equal(html_to_text(undefined), undefined);
});

test('redact_url_creds serializes non-string values', ()=>{
    assert.equal(redact_url_creds({u: 'https://a:b@h'}),
        '{"u":"https://[REDACTED]@h"}');
    assert.equal(redact_url_creds(undefined), '');
});
