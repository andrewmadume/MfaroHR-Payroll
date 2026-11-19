import test from 'node:test';
import assert from 'node:assert/strict';
import {databaseConnection} from '../lib/database-connection';
test('local database configuration retains the existing connection behavior',()=>{
 assert.deepEqual(databaseConnection('postgresql://localhost/mfaro'),{connectionString:'postgresql://localhost/mfaro'});
});
test('custom CA verification cannot be overridden by URL SSL options',()=>{
 const config=databaseConnection('postgresql://user:password@pooler.example:6543/postgres?sslmode=no-verify&sslrootcert=other&application_name=mfaro','CERT\\nCONTENT');
 const url=new URL(config.connectionString!);
 assert.equal(url.searchParams.has('sslmode'),false);assert.equal(url.searchParams.has('sslrootcert'),false);
 assert.equal(url.searchParams.get('application_name'),'mfaro');assert.deepEqual(config.ssl,{ca:'CERT\nCONTENT',rejectUnauthorized:true});
 assert.throws(()=>databaseConnection(undefined,'CERT'));
});
