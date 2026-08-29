import express from 'express';
import { requireAdminScope, ROLES } from '../auth/roles.js';
import { discoverUserSchema } from '../auth/users.js';

function qi(v){ if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(v)) throw new Error('bad_identifier'); return `"${v}"`; }
const allowedRoles = new Set(Object.values(ROLES));

export function createAdminRouter({ pool, deals, escrow, notifications, normalRate, traderRate }) {
  const router = express.Router();

  router.get('/admin/overview', requireAdminScope('members'), async (_req,res,next)=>{
    try {
      const schema = await discoverUserSchema(pool);
      const [u,l,d,x,p] = await Promise.all([
        pool.query(`select count(*)::int c from ${qi(schema.table)}`),
        pool.query(`select count(*)::int c from listings`),
        pool.query(`select count(*)::int c from deals`),
        pool.query(`select count(*)::int c from deals where status='disputed'`),
        pool.query(`select coalesce(sum(amount_try),0)::numeric total from platform_ledger where entry_type='commission'`)
      ]);
      res.json({ok:true,overview:{users:u.rows[0].c,listings:l.rows[0].c,deals:d.rows[0].c,disputes:x.rows[0].c,commissionTry:Number(p.rows[0].total)}});
    } catch(e){next(e);}
  });

  router.get('/admin/users', requireAdminScope('members'), async (req,res,next)=>{
    try {
      const schema=await discoverUserSchema(pool); const limit=Math.max(1,Math.min(500,Number(req.query.limit)||200));
      const r=await pool.query(`select * from ${qi(schema.table)} order by ${qi(schema.id)} desc limit $1`,[limit]);
      const users=r.rows.map(row=>({id:row[schema.id],email:row[schema.email],displayName:schema.displayName?row[schema.displayName]:null,role:schema.role?(row[schema.role]||'user'):'user',active:schema.active?row[schema.active]!==false:true,createdAt:schema.createdAt?row[schema.createdAt]:null}));
      res.json({ok:true,users});
    } catch(e){next(e);}
  });

  router.patch('/admin/users/:id/role', requireAdminScope('admin_management'), async (req,res,next)=>{
    try {
      const role=String(req.body?.role||''); if(!allowedRoles.has(role)||role===ROLES.ADMIN_OWNER) return res.status(400).json({ok:false,error:'invalid_role'});
      const schema=await discoverUserSchema(pool); if(!schema.role) return res.status(409).json({ok:false,error:'role_column_missing'});
      const current=await pool.query(`select ${qi(schema.role)} role from ${qi(schema.table)} where ${qi(schema.id)}=$1`,[req.params.id]);
      if(current.rows[0]?.role===ROLES.ADMIN_OWNER) return res.status(403).json({ok:false,error:'owner_role_protected'});
      const r=await pool.query(`update ${qi(schema.table)} set ${qi(schema.role)}=$2 where ${qi(schema.id)}=$1 returning ${qi(schema.id)} id, ${qi(schema.role)} role`,[req.params.id,role]);
      res.json({ok:true,user:r.rows[0]||null});
    } catch(e){next(e);}
  });

  router.patch('/admin/users/:id/active', requireAdminScope('members'), async (req,res,next)=>{
    try {
      const schema=await discoverUserSchema(pool); if(!schema.active) return res.status(409).json({ok:false,error:'active_column_missing'});
      const active=Boolean(req.body?.active);
      const r=await pool.query(`update ${qi(schema.table)} set ${qi(schema.active)}=$2 where ${qi(schema.id)}=$1 returning ${qi(schema.id)} id, ${qi(schema.active)} active`,[req.params.id,active]);
      res.json({ok:true,user:r.rows[0]||null});
    } catch(e){next(e);}
  });

  router.get('/admin/traders', requireAdminScope('traders'), async (_req,res,next)=>{
    try { const s=await discoverUserSchema(pool); const r=await pool.query(`select * from ${qi(s.table)} where ${qi(s.role)}='trader' order by ${qi(s.id)} desc`); res.json({ok:true,traders:r.rows}); } catch(e){next(e);}
  });

  router.get('/admin/trader-applications', requireAdminScope('applications'), async (_req,res,next)=>{
    try { const r=await pool.query(`select * from trader_applications order by id desc limit 200`); res.json({ok:true,applications:r.rows}); } catch(e){next(e);}
  });

  router.post('/admin/trader-applications/:id/decision', requireAdminScope('applications'), async (req,res,next)=>{
    try {
      const decision=String(req.body?.decision||''); if(!['approved','rejected'].includes(decision)) return res.status(400).json({ok:false,error:'invalid_decision'});
      const app=await pool.query(`update trader_applications set status=$2,decided_at=now(),decided_by=$3 where id=$1 and status='pending' returning *`,[req.params.id,decision,req.user.id]);
      const row=app.rows[0]; if(!row) return res.status(409).json({ok:false,error:'application_not_pending'});
      if(decision==='approved') { const s=await discoverUserSchema(pool); await pool.query(`update ${qi(s.table)} set ${qi(s.role)}='trader' where ${qi(s.id)}=$1`,[row.user_id]); }
      res.json({ok:true,application:row});
    } catch(e){next(e);}
  });

  router.get('/admin/disputes', requireAdminScope('disputes'), async (_req,res,next)=>{
    try { const r=await pool.query(`select * from deals where status='disputed' order by id desc limit 200`); res.json({ok:true,disputes:r.rows}); } catch(e){next(e);}
  });

  router.post('/admin/disputes/:id/resolve', requireAdminScope('disputes'), async (req,res,next)=>{
    try {
      const action=String(req.body?.action||''); const deal=await deals.findById(req.params.id);
      if(!deal||deal.status!=='disputed') return res.status(409).json({ok:false,error:'deal_not_disputed'});
      if(action==='refund_buyer') {
        const moving=await deals.transition({id:deal.id,fromStatuses:['disputed'],toStatus:'refunding'}); if(!moving) return res.status(409).json({ok:false,error:'deal_state_changed'});
        const refund=await escrow.refund({dealId:deal.id,buyerUserId:deal.buyerUserId,idempotencyKey:`deal:${deal.id}:admin-refund`});
        const done=await deals.transition({id:deal.id,fromStatuses:['refunding'],toStatus:'cancelled'});
        await notifications.create({userId:deal.buyerUserId,type:'dispute_resolved',title:'Anlaşmazlık çözüldü',body:'Emanet tutar alıcı bakiyesine iade edildi.',data:{dealId:deal.id}});
        await notifications.create({userId:deal.sellerUserId,type:'dispute_resolved',title:'Anlaşmazlık çözüldü',body:'İşlem alıcı lehine iade ile kapatıldı.',data:{dealId:deal.id}});
        return res.json({ok:true,deal:done,refund});
      }
      if(action==='release_seller') {
        const moving=await deals.transition({id:deal.id,fromStatuses:['disputed'],toStatus:'releasing'}); if(!moving) return res.status(409).json({ok:false,error:'deal_state_changed'});
        const settlement=await escrow.release({dealId:deal.id,sellerUserId:deal.sellerUserId,sellerRole:deal.sellerRole,normalRate,traderRate,reference:`deal:${deal.id}`,idempotencyKey:`deal:${deal.id}:admin-release`});
        const done=await deals.transition({id:deal.id,fromStatuses:['releasing'],toStatus:'completed'});
        await notifications.create({userId:deal.buyerUserId,type:'dispute_resolved',title:'Anlaşmazlık çözüldü',body:'İşlem satıcı lehine tamamlandı.',data:{dealId:deal.id}});
        await notifications.create({userId:deal.sellerUserId,type:'dispute_resolved',title:'Anlaşmazlık çözüldü',body:'Net satış tutarı bakiyenize aktarıldı.',data:{dealId:deal.id}});
        return res.json({ok:true,deal:done,settlement});
      }
      return res.status(400).json({ok:false,error:'invalid_resolution'});
    } catch(e){next(e);}
  });

  router.get('/admin/settings', requireAdminScope('admin_management'), async (_req,res,next)=>{ try{const r=await pool.query(`select key,value_json,updated_at from platform_settings order by key`);res.json({ok:true,settings:r.rows});}catch(e){next(e);} });
  router.put('/admin/settings/:key', requireAdminScope('admin_management'), async (req,res,next)=>{ try{const key=String(req.params.key).slice(0,80);const r=await pool.query(`insert into platform_settings(key,value_json,updated_by) values($1,$2::jsonb,$3) on conflict(key) do update set value_json=excluded.value_json,updated_at=now(),updated_by=excluded.updated_by returning *`,[key,JSON.stringify(req.body?.value??{}),req.user.id]);res.json({ok:true,setting:r.rows[0]});}catch(e){next(e);} });
  router.get('/admin/security-events', requireAdminScope('admin_management'), async (_req,res,next)=>{try{const r=await pool.query(`select * from security_events order by id desc limit 200`);res.json({ok:true,events:r.rows});}catch(e){next(e);}});
  router.get('/tickets', async (req,res,next)=>{try{if(!req.user)return res.status(401).json({ok:false,error:'authentication_required'});const r=await pool.query(`select * from tickets where user_id=$1 order by id desc`,[req.user.id]);res.json({ok:true,tickets:r.rows});}catch(e){next(e);}});
  router.post('/tickets', async (req,res,next)=>{try{if(!req.user)return res.status(401).json({ok:false,error:'authentication_required'});const subject=String(req.body?.subject||'').trim().slice(0,120),body=String(req.body?.body||'').trim().slice(0,4000);if(!subject||!body)return res.status(400).json({ok:false,error:'subject_body_required'});const r=await pool.query(`insert into tickets(user_id,subject,body) values($1,$2,$3) returning *`,[req.user.id,subject,body]);res.status(201).json({ok:true,ticket:r.rows[0]});}catch(e){next(e);}});

  return router;
}
