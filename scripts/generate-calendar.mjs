import{readFile,writeFile}from'node:fs/promises';import{createHash}from'node:crypto';
const source='supabase/schemas/du_calendar.sql',sql=await readFile(source,'utf8');await writeFile('deploy/du-calendar.sql',sql);await writeFile('deploy/du-calendar-manifest.json',JSON.stringify({source,sha256:createHash('sha256').update(sql).digest('hex'),additive:true},null,2)+'\n');
