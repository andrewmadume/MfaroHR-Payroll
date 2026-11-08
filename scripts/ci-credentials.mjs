import {randomBytes} from 'node:crypto';
import {appendFileSync} from 'node:fs';
if (!process.env.GITHUB_ENV) throw new Error('This helper is for GitHub Actions only');
const secret=randomBytes(48).toString('hex');
const password=randomBytes(24).toString('base64url');
console.log(`::add-mask::${secret}`);
console.log(`::add-mask::${password}`);
appendFileSync(process.env.GITHUB_ENV,`BETTER_AUTH_SECRET=${secret}\nLOCAL_DEMO_PASSWORD=${password}\n`);
