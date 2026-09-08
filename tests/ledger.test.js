import test from 'node:test';
import assert from 'node:assert/strict';
import {D,splitMoney,generatorAllocation,generatorSettlement} from '../src/ledger.js';
test('allocation preserves every kobo',()=>{for(const total of ['0.01','100.00','1234.56'])assert.equal(splitMoney(total,[1,2,3,4,6,7,8,9]).reduce((s,r)=>s.plus(r.amount),D(0)).toFixed(2),total);});
test('generator settlement credits the surplus once as a delta',()=>{const advance={rate:25,occupied:[1,2],units:{1:'100',2:'100'}};advance.allocations=generatorAllocation({...advance,budget:'100.00'});assert.deepEqual(generatorSettlement(advance,{budget:'80.00',units:{1:'100',2:'100'}}).map(r=>r.amount),['-10.00','-10.00']);});
test('invalid weights rejected',()=>assert.throws(()=>splitMoney('1.00',[1],[Infinity])));
