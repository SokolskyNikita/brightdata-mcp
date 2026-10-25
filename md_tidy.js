'use strict'; /*jslint node:true es9:true*/
// fork: scraped markdown is mostly link syntax (about half of a Wikipedia
// article is URLs). optimize_markdown() removes what carries no content:
// backslash escapes, link titles (tooltips), links to anchors on the same
// page, and the page's own origin in link URLs. drop_links() keeps only
// the link text.

// link text may hold one level of brackets, e.g. Wikipedia's [[1]](#cite)
const LINK_TEXT = '((?:[^\\[\\]]|\\[[^\\[\\]]*\\])*)';
const link_re = new RegExp(`\\[${LINK_TEXT}\\]`
    +'\\(([^()\\s]*)(?:\\s+"[^"]*")?\\)', 'g');

const escape_origin = s=>s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function optimize_markdown(md, page_url){
    if (typeof md!='string')
        return md;
    let origin = null;
    try { origin = page_url ? new URL(page_url).origin : null; }
    catch(_e){}
    const own = origin && new RegExp(`^${escape_origin(origin)}(?=/|$)`);
    return md
        .replace(/\\([!-/:-@[-`{-~])/g, '$1')
        .replace(link_re, (_m, text, url)=>{
            if (url.startsWith('#'))
                return text;
            const short = own ? url.replace(own, '') || '/' : url;
            return `[${text}](${short})`;
        })
        .replace(/\n{3,}/g, '\n\n');
}

export function drop_links(md){
    if (typeof md!='string')
        return md;
    return md.replace(link_re, '$1').replace(/\n{3,}/g, '\n\n');
}

export function tidy_markdown(md, {page_url, optimize = true, links = true}
    = {})
{
    if (optimize)
        md = optimize_markdown(md, page_url);
    if (!links)
        md = drop_links(md);
    return md;
}
