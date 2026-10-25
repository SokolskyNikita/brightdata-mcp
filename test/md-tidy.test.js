'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {optimize_markdown, drop_links, tidy_markdown} from '../md_tidy.js';

const page = 'https://en.wikipedia.org/wiki/Model_Context_Protocol';

test('link tooltips are removed, URLs kept', ()=>{
    assert.equal(optimize_markdown('[Log in](https://x.org/login "You\'re '
        +'encouraged to log in")'), '[Log in](https://x.org/login)');
});

test('the page\'s own origin is shortened to a path, others are not', ()=>{
    assert.equal(optimize_markdown('[A](https://en.wikipedia.org/wiki/A) '
        +'[B](https://openai.com/b) [C](https://en.wikipedia.org)', page),
    '[A](/wiki/A) [B](https://openai.com/b) [C](/)');
    assert.equal(optimize_markdown('[E](https://en.wikipedia.org.evil.com/x)',
        page), '[E](https://en.wikipedia.org.evil.com/x)');
});

test('links to anchors on the page keep only their text', ()=>{
    assert.equal(optimize_markdown('see [Background](#Background) and '
        +'[\\[1\\]](#cite_note-1)', page), 'see Background and [1]');
});

test('escapes are removed and blank runs collapsed', ()=>{
    assert.equal(optimize_markdown('a\\_b \\*c\\*\n\n\n\nd'), 'a_b *c*\n\nd');
});

test('drop_links keeps link text only', ()=>{
    assert.equal(drop_links('[A](/a) and [[1]](#c) and [](/empty)'),
        'A and [1] and ');
});

test('tidy_markdown: optimize can be turned off, links can be dropped',
()=>{
    const md = '[A](https://en.wikipedia.org/wiki/A "tip") a\\_b';
    assert.equal(tidy_markdown(md, {page_url: page}), '[A](/wiki/A) a_b');
    assert.equal(tidy_markdown(md, {page_url: page, optimize: false}), md);
    assert.equal(tidy_markdown(md, {page_url: page, links: false}), 'A a_b');
    assert.equal(tidy_markdown(undefined), undefined);
});
