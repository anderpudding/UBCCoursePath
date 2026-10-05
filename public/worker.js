import {solve} from '/lib/core.js';
self.onmessage=({data})=>{try{self.postMessage(solve(data.courses,data.options));}catch{self.postMessage({ok:false,reason:'Schedule could not be generated. Check the course data.'});}};
