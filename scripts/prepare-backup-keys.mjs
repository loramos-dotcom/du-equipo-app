import {generateKeyPairSync,randomBytes}from'node:crypto';import {mkdir,writeFile,access}from'node:fs/promises';
const ownerEmail=process.env.DU_BACKUP_OWNER_EMAIL;if(!ownerEmail)throw Error('Configurá DU_BACKUP_OWNER_EMAIL antes de generar claves.');
const folder='.data/backup-setup';await mkdir(folder,{recursive:true});
try{await access(folder+'/recovery-private.pem');console.log('Existing recovery key retained.');process.exit(0);}catch{}
const keyId='du-recovery-'+new Date().toISOString().slice(0,10),keys=generateKeyPairSync('rsa',{modulusLength:3072,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
await writeFile(folder+'/recovery-private.pem',keys.privateKey,{mode:0o600,flag:'wx'});await writeFile(folder+'/DU_BACKUP_PUBLIC_KEY',keys.publicKey,{flag:'wx'});await writeFile(folder+'/DU_BACKUP_KEY_ID',keyId,{flag:'wx'});await writeFile(folder+'/DU_BACKUP_SEAL_KEY',randomBytes(32).toString('base64'),{mode:0o600,flag:'wx'});await writeFile(folder+'/CRON_SECRET',randomBytes(32).toString('base64url'),{mode:0o600,flag:'wx'});await writeFile(folder+'/DU_BACKUP_OWNER_EMAIL',ownerEmail,{flag:'wx'});
console.log('Keys prepared privately. Private recovery key stays outside deployment and backups.');
