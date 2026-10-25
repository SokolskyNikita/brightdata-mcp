'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {is_blocked_page, blocked_page_text} from '../browser_tools.js';

// the error Bright Data's browser returned for a Wikipedia search page
const kyc_error = 'Error navigating to https://en.wikipedia.org/w/index.php'
    +'?search=x: Error: page.goto: Protocol error (Page.navigate): Requested '
    +'URL (https://en.wikipedia.org/w/index.php?search=x) is restricted in '
    +'accordance with robots.txt. To get full access to target domains '
    +'without robots.txt restrictions, start a KYC application: '
    +'https://docs.brightdata.com/products/residential/network-access'
    +'#kyc-verification.';

test('the robots.txt / KYC refusal is recognized', ()=>{
    assert.equal(is_blocked_page(new Error(kyc_error)), true);
    assert.equal(is_blocked_page(kyc_error), true);
});

test('other browser errors are not', ()=>{
    for (const msg of ['locator.click: Timeout 5000ms exceeded.',
        'page.goto: net::ERR_NAME_NOT_RESOLVED', 'robots.txt was fetched'])
    {
        assert.equal(is_blocked_page(new Error(msg)), false, msg);
    }
    assert.equal(is_blocked_page(undefined), false);
});

test('the replacement message is short and names no KYC', ()=>{
    assert.ok(blocked_page_text.length<100);
    assert.doesNotMatch(blocked_page_text, /kyc|robots/i);
});
