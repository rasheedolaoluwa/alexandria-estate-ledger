import { execFileSync } from 'node:child_process';
import { copyFileSync } from 'node:fs';
execFileSync('npx',['vite','build'],{stdio:'inherit'});
execFileSync('npx',['vite','build','--ssr','server/worker.js'],{stdio:'inherit'});
copyFileSync('data/original-workbook.xlsx','dist/client/original-workbook.xlsx');
