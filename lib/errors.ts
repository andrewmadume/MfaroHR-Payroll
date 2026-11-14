export class PublicError extends Error {
 constructor(public status:number,message:string){super(message.replace(/^\d{3}:\s*/,''));this.name='PublicError';const code=Number(message.match(/^(\d{3}):/)?.[1]);if(code>=400&&code<500)this.status=code;}
}
