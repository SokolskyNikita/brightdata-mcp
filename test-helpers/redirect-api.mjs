'use strict'; /*jslint node:true es9:true*/
import axios from 'axios';

const stub_url = process.env.__BRD_TEST_STUB_URL;
// fork: test servers never write to the real stats file
process.env.STATS_FILE ??= 'off';

axios.interceptors.request.use(config=>{
    if (stub_url && typeof config.url=='string')
    {
        config.url = config.url.replace('https://api.brightdata.com',
            stub_url).replace('https://docs.brightdata.com', stub_url);
    }
    return config;
});
