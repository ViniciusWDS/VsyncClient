import type {UpdateState} from '../../src/shared';
import type {Updates} from './updates';

const CHECK_INTERVAL=6*60*60*1000;
const RETRY_INTERVAL=15*60*1000;
export interface AutomaticUpdateHost {
 canInstall:()=>boolean|Promise<boolean>;
 install:()=>Promise<void>;
 error:(message:string)=>void;
}

// One coordinator owns automatic work. Manual cancellation lasts for this session,
// while network failures retry later without interrupting the launcher startup.
export class AutomaticUpdates {
 private busy=false;
 private paused=false;
 private nextCheck=0;
 private nextInstall=0;
 constructor(private updates:Updates,private host:AutomaticUpdateHost,private now=Date.now){}
 pause(){this.paused=true;this.updates.cancel();}
 resume(){this.paused=false;}
 async poll(forceCheck=false):Promise<UpdateState>{
  if(this.busy||this.updates.state.state==='unconfigured')return {...this.updates.state};
  this.busy=true;
  try{
   if(forceCheck){this.paused=false;this.nextInstall=0;}
   if(forceCheck||this.now()>=this.nextCheck){
    this.nextCheck=this.now()+CHECK_INTERVAL;
    await this.updates.check();
    if(this.updates.state.state==='error')this.nextCheck=this.now()+RETRY_INTERVAL;
   }
   if(!this.paused&&this.updates.state.state==='available'){
    const downloaded=await this.updates.download();
    if(downloaded.state==='error')this.nextCheck=this.now()+RETRY_INTERVAL;
   }
   if(!this.paused&&this.updates.state.state==='ready'&&this.now()>=this.nextInstall&&await this.host.canInstall()&&!this.paused){
    this.nextInstall=this.now()+RETRY_INTERVAL;
    await this.host.install();
   }
  }catch(e){
   this.nextInstall=this.now()+RETRY_INTERVAL;
   const message=e instanceof Error?e.message:String(e);
   if(this.updates.state.state==='ready'||this.updates.state.state==='installing')this.updates.installationFailed(message);
   this.host.error(message);
  }finally{this.busy=false;}
  return {...this.updates.state};
 }
}
