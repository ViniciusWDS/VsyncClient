import {spawn} from 'node:child_process';
import {createServer} from 'vite';
await import('./build-main.mjs');
const server=await createServer(); await server.listen();
const electron=(await import('electron')).default;
const child=spawn(electron,['.'],{stdio:'inherit',env:{...process.env,VSYNC_DEV_URL:'http://localhost:5173'}});
child.on('exit',async(code)=>{await server.close();process.exit(code??0)});
