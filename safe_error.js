'use strict'; /*jslint node:true es9:true*/

const cred_url_re = /((?:wss?|https?):\/\/)[^/@\s]+@/gi;
export const max_error_len = 2000;
const html_re = /<(?:!doctype|html|head|body|title|div|p|h1)\b/i;
const entities = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
    nbsp: ' ', '#39': "'"};

export const redact_url_creds = value=>
    (typeof value=='string' ? value : JSON.stringify(value) ?? '')
        .replace(cred_url_re, '$1[REDACTED]@');

export const redact_token = (value, api_token)=>{
    const text = String(value);
    return api_token ? text.split(api_token).join('[REDACTED]') : text;
};

// error pages are mostly markup; keep only their text so the cap
// is spent on the message, not on CSS and scripts
export const html_to_text = value=>{
    if (typeof value!='string' || !html_re.test(value))
        return value;
    return value
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1\s*>/gi,
            ' ')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, (_m, k)=>entities[k])
        .replace(/\s+/g, ' ')
        .trim();
};

export const safe_error = (e, api_token, warn = console.error)=>{
    try {
        const message = typeof e=='string' ? e
            : e instanceof Error && typeof e.message=='string' ? e.message
            : 'Tool execution failed';
        const text = redact_url_creds(redact_token(message, api_token));
        if (text.length>max_error_len)
            warn(`[error] truncated ${text.length} chars`);
        return text.slice(0, max_error_len);
    } catch(_e){
        return 'Tool execution failed';
    }
};
