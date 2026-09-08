import Decimal from 'decimal.js';
Decimal.set({precision:40});
export const D = x => new Decimal(x == null || x === '' ? 0 : x);
export function fieldValue(field) { return field?.type === 'n' ? field.value : null; }
export function amount(value) { if(typeof value !== 'string' || !/^\d{1,12}(\.\d{1,2})?$/.test(value) || D(value).lte(0)) throw Error('Enter a positive amount with at most two decimal places.');return D(value).toFixed(2); }
export function splitMoney(total, houses, weights = houses.map(()=>1)) {
  if(!houses.length || weights.length!==houses.length || new Set(houses).size!==houses.length) throw Error('Select eligible houses.');
  const sum=weights.reduce((s,w)=>s.plus(w),D(0));
  if(!sum.isFinite() || sum.lte(0) || weights.some(w=>!D(w).isFinite()||D(w).lt(0)))throw Error('Enter non-negative allocation units with a positive total.');
  const cents=D(total).times(100);if(!cents.isInteger()||cents.lt(0))throw Error('Invalid allocation amount.');
  const rows=houses.map((house,i)=>{const exact=cents.times(weights[i]).div(sum);return {house,cents:exact.floor(),fraction:exact.minus(exact.floor())};});
  let left=cents.minus(rows.reduce((s,r)=>s.plus(r.cents),D(0))).toNumber();
  const ranked=[...rows].sort((a,b)=>b.fraction.cmp(a.fraction)||a.house-b.house);
  for(let i=0;i<left;i++)ranked[i].cents=ranked[i].cents.plus(1);
  return rows.map(r=>({house:r.house,amount:r.cents.div(100).toFixed(2)}));
}
export function currentBalances(history,entries) {
  const last=history.periods.at(-1).id;
  return Array.from({length:9},(_,i)=>{const house=i+1,s=history.statements.find(s=>s.period===last&&s.house===house);let balance=D(s.closing);
    for(const e of entries){if(e.kind==='payment'&&e.house===house)balance=balance.plus(e.amount);if(e.kind==='adjustment'&&e.house===house)balance=e.direction==='credit'?balance.plus(e.amount):balance.minus(e.amount);if(e.kind==='bill'||e.kind==='generator-charge'||e.kind==='generator-settlement'){const a=e.allocations.find(x=>x.house===house);if(a)balance=balance.minus(a.amount);}}
    return {house,sourceClosing:s.closing,balance:balance.toString()};
  });
}
export function generatorAllocation(input) {
  const {budget,rate,units,occupied}=input;if(budget!=='0.00')amount(budget);
  if(!Number.isInteger(rate)||rate<20||rate>30)throw Error('Availability share must be 20% to 30%.');
  if(!Array.isArray(occupied)||!occupied.length||occupied.some(h=>!Number.isInteger(h)||h<1||h>9)||new Set(occupied).size!==occupied.length)throw Error('Select occupied houses.');
  for(const h of occupied)if(!units||!/^\d{1,12}(\.\d{1,6})?$/.test(String(units[h]))||D(units[h]).lt(0))throw Error('Enter measured or approved estimated units for each occupied house (zero is allowed).');
  if(budget==='0.00')return occupied.map(h=>({house:h,amount:'0.00',availability:'0.00',consumption:'0.00'}));
  const equal=D(budget).times(rate).div(100).toDecimalPlaces(2);
  const availability=splitMoney(equal.toFixed(2),occupied);
  const variable=splitMoney(D(budget).minus(equal).toFixed(2),occupied,occupied.map(h=>units[h]));
  return occupied.map(h=>({house:h,amount:D(availability.find(x=>x.house===h).amount).plus(variable.find(x=>x.house===h).amount).toFixed(2),availability:availability.find(x=>x.house===h).amount,consumption:variable.find(x=>x.house===h).amount}));
}
export function generatorSettlement(advance,input) {
  const final=generatorAllocation({...input,rate:advance.rate,occupied:advance.occupied});
  return final.map(row=>({...row,finalCharge:row.amount,advance:advance.allocations.find(a=>a.house===row.house).amount,amount:D(row.amount).minus(advance.allocations.find(a=>a.house===row.house).amount).toFixed(2)}));
}
