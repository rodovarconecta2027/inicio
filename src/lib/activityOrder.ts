/** Publication time only: future-dated legacy/demo records must not outrank new activity. */
export function activityTime(value?: string, now=Date.now()): number {
 const time=Date.parse(value||'');
 return Number.isFinite(time)&&time<=now?time:0;
}
export function compareRecent(a:{createdAtIso?:string;publishedAtIso?:string},b:{createdAtIso?:string;publishedAtIso?:string}){
 return activityTime(b.publishedAtIso||b.createdAtIso)-activityTime(a.publishedAtIso||a.createdAtIso);
}
