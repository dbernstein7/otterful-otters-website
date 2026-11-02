const {isKvConfigured,zrevrangeWithScores,zscore}=require("../otter-kart-leaderboard/kv.js");
const {leaderboardKeys}=require("./leaderboard.js");
async function handleRewardsLeaderboardGet(query={}) {
  if (query.game === "otter-kart") return require("../otter-kart-leaderboard/handlers.js").handleGet(query);
  const mode=query.mode == null ? null : String(query.mode);
  if(mode!==null && mode!=="timed" && mode!=="endless") return {status:400,json:{ok:false,message:"Unknown Shell Snag mode."}};
  const limit=Math.min(50,Math.max(1,parseInt(query.limit,10)||15));
  if(!isKvConfigured())return {status:200,json:{ok:true,configured:false,mode,rows:[]}};
  try {
    const keys=leaderboardKeys(mode),raw=await zrevrangeWithScores(keys.points,limit),rows=[];
    for(let i=0;i<(raw||[]).length;i+=2) {
      const wallet=String(raw[i]);const shells=Number(await zscore(keys.shells,wallet))||0;
      rows.push({wallet,walletShort:wallet,points:Number(raw[i+1])||0,shells});
    }
    return {status:200,json:{ok:true,configured:true,mode,rows}};
  } catch {return {status:503,json:{ok:false,configured:true,mode,rows:[],message:"Leaderboard is temporarily unavailable."}};}
}
module.exports={handleRewardsLeaderboardGet};
