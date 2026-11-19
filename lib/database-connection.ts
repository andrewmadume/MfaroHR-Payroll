import type {PoolConfig} from 'pg';

export function databaseConnection(connectionString?:string,ca?:string):PoolConfig{
 if(!ca)return {connectionString};
 if(!connectionString)throw Error('DATABASE_URL is required when DATABASE_SSL_CA is configured');
 const url=new URL(connectionString);
 // pg's URL SSL options replace an explicit ssl object, dropping its trust anchor.
 for(const key of ['ssl','sslmode','sslrootcert','sslcert','sslkey'])url.searchParams.delete(key);
 return {connectionString:url.toString(),ssl:{ca:ca.replaceAll('\\n','\n'),rejectUnauthorized:true}};
}
