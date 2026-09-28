export const foodRates:Record<string,number>={supply:1,cart:3,spear_guard:2,crossbow_guard:2,pikeman:4,archer:4,lance_cavalry:12,mounted_archer:12,heavy_general:50}
export interface UpkeepState {hourly:number;food:number;shortage:boolean;lastGameAt:string}
// Integrate each newly produced unit's age without iterating over the batch.
export function productionSoldierHours(start:number,seconds:number,completed:number,quantity:number,from:number,to:number){
 const integral=(at:number)=>{const n=Math.max(completed,Math.min(quantity,Math.floor((at-start)/(seconds*1000)))),count=n-completed;if(count<=0)return 0;return (count*(at-start)-seconds*1000*(completed+1+n)*count/2)/3600000}
 return Math.max(0,integral(to)-integral(from))
}
export function foodCharge(food:number,fraction:number,required:number){const demand=Math.max(0,fraction+required),whole=Math.floor(demand+1e-9),paid=Math.min(food,whole);return {paid,food:food-paid,fraction:food<=whole?0:Math.max(0,demand-whole)}}
