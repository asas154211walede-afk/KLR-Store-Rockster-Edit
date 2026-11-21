require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const crypto = require('crypto');
const db = require('./db');
const {SERVICES, STATUSES} = require('./common');
const app = express();
const uploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads');
fs.mkdirSync(uploadDir,{recursive:true});
app.set('trust proxy', 1);
app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'",'https://fonts.googleapis.com'],fontSrc:["'self'",'https://fonts.gstatic.com'],imgSrc:["'self'",'data:'],scriptSrc:["'self'"],connectSrc:["'self'"]}}}));
app.use(express.json({limit:'150kb'}));
app.use(express.urlencoded({extended:false,limit:'50kb'}));
const sessionDir = path.dirname(path.resolve(process.env.DB_PATH || './data/klr.sqlite'));
fs.mkdirSync(sessionDir,{recursive:true});
if (process.env.NODE_ENV === 'production' && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) { throw new Error('SESSION_SECRET must be set to at least 32 characters in production'); }
app.use(session({store:new SQLiteStore({db:'sessions.sqlite',dir:sessionDir}),secret:process.env.SESSION_SECRET||'development-only-change-me',resave:false,saveUninitialized:false,cookie:{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:1000*60*60*24*7}}));
app.use(express.static(path.join(__dirname,'../public')));
const limiter = rateLimit({windowMs:15*60*1000,limit:100,standardHeaders:true,legacyHeaders:false});
app.use('/api/',limiter);
const setting = k => db.prepare('SELECT value FROM settings WHERE key=?').get(k)?.value || '';
const setSetting = (k,v) => db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k,String(v));
const log = (actor,action,details='') => db.prepare('INSERT INTO audit_log(actor,action,details) VALUES(?,?,?)').run(actor,action,String(details).slice(0,1000));
const queue = (type,payload) => db.prepare('INSERT INTO outbox(event_type,payload) VALUES(?,?)').run(type,JSON.stringify(payload));
const safeUser = u => ({id:u.id,email:u.email,display_name:u.display_name,role:u.role});
const requireAuth=(req,res,next)=>req.session.user?next():res.status(401).json({error:'يلزم تسجيل الدخول'});
const requireAdmin=(req,res,next)=>req.session.user?.role==='admin'?next():res.status(403).json({error:'غير مصرح'});
function ensureAdmin(){
 const email=process.env.ADMIN_EMAIL, pass=process.env.ADMIN_PASSWORD;
 if(!email||!pass) return;
 const exists=db.prepare('SELECT id FROM users WHERE email=?').get(email.toLowerCase());
 if(!exists){const hash=bcrypt.hashSync(pass,12);db.prepare("INSERT INTO users(email,password_hash,display_name,role) VALUES(?,?,?,'admin')").run(email.toLowerCase(),hash,'KLR Admin');}
}
ensureAdmin();
app.get('/api/health',(req,res)=>res.json({ok:true,service:'KLR Store API'}));
app.get('/api/services',(req,res)=>res.json({services:SERVICES,sar_per_kwd:Number(setting('sar_per_kwd'))||12.2}));
app.get('/api/session',(req,res)=>res.json({user:req.session.user||null}));
app.post('/api/register',async(req,res)=>{
 const {email,password,name}=req.body||{};
 if(!email||!password||!name||String(password).length<10) return res.status(400).json({error:'أدخل الاسم والبريد وكلمة مرور من 10 أحرف على الأقل'});
 try{const hash=await bcrypt.hash(String(password),12);const info=db.prepare("INSERT INTO users(email,password_hash,display_name) VALUES(?,?,?)").run(String(email).trim().toLowerCase(),hash,String(name).trim().slice(0,60));const u=db.prepare('SELECT * FROM users WHERE id=?').get(info.lastInsertRowid);req.session.user=safeUser(u);res.json({user:req.session.user});}catch(e){res.status(409).json({error:'البريد مستخدم أو البيانات غير صالحة'});}
});
app.post('/api/login',async(req,res)=>{const {email,password}=req.body||{};const u=db.prepare('SELECT * FROM users WHERE email=?').get(String(email||'').trim().toLowerCase());if(!u||!await bcrypt.compare(String(password||''),u.password_hash))return res.status(401).json({error:'بيانات الدخول غير صحيحة'});req.session.regenerate(err=>{if(err)return res.status(500).json({error:'تعذر تسجيل الدخول'});req.session.user=safeUser(u);res.json({user:req.session.user});});});
app.post('/api/logout',(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.post('/api/orders',requireAuth,(req,res)=>{
 const {service_id,details,contact_method,contact_value}=req.body||{};const service=SERVICES.find(s=>s.id===service_id);
 if(!service||!details||String(details).trim().length<8||!contact_method||!contact_value)return res.status(400).json({error:'أكمل تفاصيل الطلب ووسيلة التواصل'});
 const code='KLR-'+new Date().toISOString().slice(2,10).replace(/-/g,'')+'-'+crypto.randomBytes(3).toString('hex').toUpperCase();
 const info=db.prepare("INSERT INTO orders(order_code,user_id,service_id,service_name,price_kwd,details,contact_method,contact_value,status) VALUES(?,?,?,?,?,?,?,?,?)").run(code,req.session.user.id,service.id,service.name,service.price,String(details).trim().slice(0,3000),String(contact_method),String(contact_value).trim().slice(0,120),'بانتظار التحويل');
 const order=db.prepare('SELECT * FROM orders WHERE id=?').get(info.lastInsertRowid);queue('new_order',{order});log(req.session.user.email,'create_order',code);res.status(201).json({order:publicOrder(order),payment:publicPayment()});
});
function publicOrder(o){return {order_code:o.order_code,service_name:o.service_name,price_kwd:o.price_kwd,status:o.status,details:o.details,contact_method:o.contact_method,contact_value:o.contact_value,created_at:o.created_at,updated_at:o.updated_at,has_receipt:!!o.receipt_path,admin_note:o.admin_note||''};}
function publicPayment(){return {enabled:setting('payment_enabled')==='true',label:setting('payment_method_label'),instructions:setting('payment_instructions'),bank_name:setting('payment_bank_name'),account_holder:setting('payment_account_holder'),iban:setting('payment_iban'),phone:setting('payment_phone')};}
app.get('/api/orders',requireAuth,(req,res)=>{const rows=req.session.user.role==='admin'?db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 300').all():db.prepare('SELECT * FROM orders WHERE user_id=? ORDER BY id DESC').all(req.session.user.id);res.json({orders:rows.map(publicOrder)});});
app.get('/api/orders/:code',requireAuth,(req,res)=>{const o=db.prepare('SELECT * FROM orders WHERE order_code=?').get(req.params.code);if(!o|| (req.session.user.role!=='admin'&&o.user_id!==req.session.user.id))return res.status(404).json({error:'الطلب غير موجود'});res.json({order:publicOrder(o),payment:req.session.user.role==='admin'?publicPayment():{enabled:setting('payment_enabled')==='true',label:setting('payment_method_label'),instructions:setting('payment_instructions')}});});
const storage=multer.diskStorage({destination:(req,file,cb)=>cb(null,uploadDir),filename:(req,file,cb)=>cb(null,crypto.randomBytes(18).toString('hex')+'.'+(file.mimetype==='image/png'?'png':file.mimetype==='image/webp'?'webp':'jpg'))});
const receiptUpload=multer({storage,limits:{fileSize:5*1024*1024,files:1},fileFilter:(req,file,cb)=>cb(null,['image/jpeg','image/png','image/webp'].includes(file.mimetype))});
app.post('/api/orders/:code/receipt',requireAuth,receiptUpload.single('receipt'),(req,res)=>{const o=db.prepare('SELECT * FROM orders WHERE order_code=?').get(req.params.code);if(!o||o.user_id!==req.session.user.id)return res.status(404).json({error:'الطلب غير موجود'});if(!req.file)return res.status(400).json({error:'ارفع صورة JPG أو PNG أو WEBP بحجم لا يتجاوز 5MB'});if(!['بانتظار التحويل','بانتظار مراجعة الدفع'].includes(o.status))return res.status(400).json({error:'لا يمكن رفع إيصال لهذه الحالة'});db.prepare("UPDATE orders SET receipt_path=?,status='بانتظار مراجعة الدفع',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(req.file.filename,o.id);const updated=db.prepare('SELECT * FROM orders WHERE id=?').get(o.id);queue('receipt_uploaded',{order:updated});log(req.session.user.email,'receipt_uploaded',o.order_code);res.json({order:publicOrder(updated),message:'تم استلام الإيصال للمراجعة. لا يعني ذلك تأكيد وصول المبلغ.'});});
app.get('/api/admin/settings',requireAuth,requireAdmin,(req,res)=>res.json({settings:{sar_per_kwd:setting('sar_per_kwd'),payment_enabled:setting('payment_enabled'),payment_method_label:setting('payment_method_label'),payment_bank_name:setting('payment_bank_name'),payment_account_holder:setting('payment_account_holder'),payment_iban:setting('payment_iban'),payment_phone:setting('payment_phone'),payment_instructions:setting('payment_instructions')}}));
app.put('/api/admin/settings',requireAuth,requireAdmin,(req,res)=>{const allowed=['sar_per_kwd','payment_enabled','payment_method_label','payment_bank_name','payment_account_holder','payment_iban','payment_phone','payment_instructions'];for(const k of allowed)if(req.body[k]!==undefined)setSetting(k,k==='payment_enabled'?(req.body[k]?'true':'false'):String(req.body[k]).slice(0,1000));log(req.session.user.email,'update_settings','payment/settings');res.json({ok:true});});
app.patch('/api/admin/orders/:code',requireAuth,requireAdmin,(req,res)=>{const {status,admin_note}=req.body||{};if(!STATUSES.includes(status))return res.status(400).json({error:'حالة غير معتمدة'});const o=db.prepare('SELECT * FROM orders WHERE order_code=?').get(req.params.code);if(!o)return res.status(404).json({error:'الطلب غير موجود'});db.prepare('UPDATE orders SET status=?,admin_note=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(status,String(admin_note||'').slice(0,1000),o.id);const updated=db.prepare('SELECT * FROM orders WHERE id=?').get(o.id);queue('order_updated',{order:updated});log(req.session.user.email,'update_order',`${o.order_code}:${status}`);res.json({order:publicOrder(updated)});});
app.get('/api/admin/receipt/:code',requireAuth,requireAdmin,(req,res)=>{const o=db.prepare('SELECT receipt_path FROM orders WHERE order_code=?').get(req.params.code);if(!o?.receipt_path)return res.status(404).end();res.sendFile(path.join(uploadDir,path.basename(o.receipt_path)));});
app.get('/api/admin/stats',requireAuth,requireAdmin,(req,res)=>{const total=db.prepare('SELECT COUNT(*) n FROM orders').get().n;const completed=db.prepare("SELECT COUNT(*) n FROM orders WHERE status='مكتمل'").get().n;const paid=db.prepare("SELECT COALESCE(SUM(price_kwd),0) n FROM orders WHERE status IN ('تم تأكيد الدفع','قيد التنفيذ','مكتمل')").get().n;const pending=db.prepare("SELECT COUNT(*) n FROM orders WHERE status IN ('بانتظار التحويل','بانتظار مراجعة الدفع')").get().n;res.json({total,completed,paid,pending});});
app.get('/api/admin/audit',requireAuth,requireAdmin,(req,res)=>res.json({logs:db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 100').all()}));
app.get('/api/admin/receipt-file/:code',requireAuth,requireAdmin,(req,res)=>{const o=db.prepare('SELECT receipt_path FROM orders WHERE order_code=?').get(req.params.code);if(!o?.receipt_path)return res.status(404).end();res.sendFile(path.join(uploadDir,path.basename(o.receipt_path)));});
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'../public/index.html')));
const port=Number(process.env.PORT)||3000;app.listen(port,()=>console.log(`KLR Store listening on ${port}`));
