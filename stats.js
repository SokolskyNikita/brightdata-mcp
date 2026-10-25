'use strict'; /*jslint node:true es9:true*/
// fork: one JSON line per tool call (start time, tool, duration, outcome,
// and what the tool put in tool_meta) so performance can be checked later.
// Tool arguments are never written. STATS_FILE sets the path; 'off'
// turns it off.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

export const default_stats_file = ()=>path.join(os.homedir(),
    '.brightdata-mcp', 'stats.jsonl');

export function create_stats(file = process.env.STATS_FILE,
    warn = console.error)
{
    if (file=='off')
        return {file: null, record: ()=>{}, flush: async()=>{}};
    file = path.resolve(file || default_stats_file());
    let queue = fs.promises.mkdir(path.dirname(file), {recursive: true});
    let warned = false;
    const record = rec=>{
        const line = JSON.stringify(rec)+'\n';
        queue = queue.then(()=>fs.promises.appendFile(file, line))
            .catch(e=>{
                if (!warned)
                    warn(`[stats] cannot write ${file}: ${e.message}`);
                warned = true;
            });
    };
    return {file, record, flush: ()=>queue};
}

// what get_stats_file returns: where the file is and what it covers
export async function describe_stats(file){
    if (!file)
        return {enabled: false, note: 'Stats logging is off (STATS_FILE=off)'};
    let calls = 0, first = null, last = null;
    try {
        const text = await fs.promises.readFile(file, 'utf8');
        const lines = text.split('\n').filter(Boolean);
        calls = lines.length;
        if (calls)
        {
            first = JSON.parse(lines[0]).ts;
            last = JSON.parse(lines[calls-1]).ts;
        }
    } catch(e){
        if (e.code!='ENOENT')
            throw e;
    }
    return {enabled: true, path: file, url: pathToFileURL(file).href,
        calls, first, last};
}
