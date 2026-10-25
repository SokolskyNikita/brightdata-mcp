'use strict'; /*jslint node:true es9:true*/
// fork: hedged requests. attempt(signal, n) is started at each of
// delays_ms (ms since the previous start), or at once when every running
// attempt has failed. The first value an attempt resolves with wins and
// the others are aborted. It rejects with the last error when all
// attempts fail, or at once on an error is_final() accepts.
export function first_success(attempt, {delays_ms = [0, 15000],
    is_final = ()=>false, on_error = ()=>{}} = {})
{
    return new Promise((resolve, reject)=>{
        const controllers = [];
        let started = 0, running = 0, done = false, timer;
        const finish = (fn, value)=>{
            if (done)
                return;
            done = true;
            clearTimeout(timer);
            for (const c of controllers)
                c.abort();
            fn(value);
        };
        const start = ()=>{
            if (done || started>=delays_ms.length)
                return;
            const n = started++;
            running++;
            clearTimeout(timer);
            if (started<delays_ms.length)
                timer = setTimeout(start, delays_ms[started]);
            const controller = new AbortController();
            controllers.push(controller);
            Promise.resolve().then(()=>attempt(controller.signal, n))
                .then(value=>finish(resolve, value), e=>{
                    running--;
                    if (done)
                        return;
                    on_error(e, n);
                    if (is_final(e) || !running && started>=delays_ms.length)
                        return void finish(reject, e);
                    if (!running)
                        start();
                });
        };
        timer = setTimeout(start, delays_ms[0]);
    });
}
