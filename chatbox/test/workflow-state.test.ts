import {expect,it,vi} from 'vitest';
import {observeWorkflowState} from '../src/workflow-state';

function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>resolve=r);return {promise,resolve};}

it('keeps two views current, rejects a late snapshot and closes only one subscription',async()=>{
 const listeners=new Set<(state:number)=>void>();
 const snapshots=[deferred<number>(),deferred<number>()];
 const received=[vi.fn(),vi.fn()];const report=vi.fn();
 const subscribe=async(fn:(state:number)=>void)=>{listeners.add(fn);return ()=>{listeners.delete(fn);};};
 const stops=received.map((receive,i)=>observeWorkflowState(subscribe,()=>snapshots[i]!.promise,receive,report));
 await Promise.resolve();
 for(const listener of listeners)listener(2);
 snapshots.forEach(s=>s.resolve(1));await Promise.resolve();await Promise.resolve();
 for(const receive of received){expect(receive).toHaveBeenCalledTimes(1);expect(receive).toHaveBeenLastCalledWith(2);}
 stops[1]!();for(const listener of listeners)listener(3);
 expect(received[0]).toHaveBeenLastCalledWith(3);expect(received[1]).toHaveBeenCalledTimes(1);
 stops[0]!();expect(listeners.size).toBe(0);expect(report).not.toHaveBeenCalled();
});

it('unsubscribes when a window closes before listener registration completes',async()=>{
 const registration=deferred<()=>void>();const unsubscribe=vi.fn(),snapshot=vi.fn(),receive=vi.fn();
 const stop=observeWorkflowState(()=>registration.promise,snapshot,receive,vi.fn());
 stop();registration.resolve(unsubscribe);await Promise.resolve();
 expect(unsubscribe).toHaveBeenCalledTimes(1);expect(snapshot).not.toHaveBeenCalled();expect(receive).not.toHaveBeenCalled();
});

it('loads a snapshot when no event arrives and reports a live snapshot failure',async()=>{
 const receive=vi.fn(),report=vi.fn();
 const stop=observeWorkflowState(async()=>()=>{},async()=>7,receive,report);
 await vi.waitFor(()=>expect(receive).toHaveBeenCalledWith(7));stop();
 const failed=observeWorkflowState(async()=>()=>{},async()=>{throw Error('offline');},receive,report);
 await vi.waitFor(()=>expect(report).toHaveBeenCalledWith(expect.objectContaining({message:'offline'})));failed();
});
