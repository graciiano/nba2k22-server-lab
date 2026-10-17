'use strict';
function createLaboratoryClock(config={}, wallNow=Date.now) {
  const wallStart=wallNow();
  if(!config.anchorUtc)return ()=>new Date(wallNow());
  const anchor=Date.parse(config.anchorUtc);
  if(!Number.isFinite(anchor))throw new Error('Invalid laboratory clock anchorUtc');
  return ()=>new Date(anchor+Math.max(0,wallNow()-wallStart));
}
module.exports={createLaboratoryClock};
